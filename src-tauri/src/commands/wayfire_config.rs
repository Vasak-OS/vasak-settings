use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::SystemTime;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::commands::wayfire_ini::parse_section;
use crate::logger::{log_debug, log_error};

/// Sent to the frontend when the file changed underneath the application.
pub const CHANGED_EVENT: &str = "wayfire-config-changed";

/// (modification time, size) — enough to notice a file that is no longer the
/// one we cached, without reading it.
type Stamp = (SystemTime, u64);

struct Cached {
	content: String,
	stamp: Option<Stamp>,
}

/// The single owner of ~/.config/wayfire.ini.
///
/// Every page in the application reads and writes the same file, and each save
/// used to do it on its own: read the whole file, merge one section, write the
/// whole file back. Two things came out of that.
///
/// A page that saves several sections at once — the Windows one saves nine —
/// fired nine of those in parallel, so the nine reads all saw the same file and
/// the last write won: eight of the nine saves were thrown away, every time.
///
/// And `fs::write` truncates the file before writing it, so anything reading
/// while a save was in flight could see a *half* file. That is not theoretical
/// here: wayfire watches this file and reloads it on every change, and the next
/// save reads it back to merge into it — reading a truncated copy and writing
/// that back is how a whole config disappears.
///
/// So the file has one owner. One lock around the whole read-modify-write, so
/// saves queue instead of overwriting each other. One atomic write — a
/// temporary file next to it, then a rename, which anyone reading sees as
/// either the old file or the new one and never as something in between. One
/// cached copy, so opening a page is one read and not nine. And one watcher, so
/// an edit made outside the application reaches the pages instead of being
/// silently overwritten by whatever they still had on screen.
pub struct WayfireConfig {
	path: Result<PathBuf, String>,
	cached: Mutex<Option<Cached>>,
}

impl WayfireConfig {
	pub fn global() -> &'static WayfireConfig {
		static CONFIG: OnceLock<WayfireConfig> = OnceLock::new();

		CONFIG.get_or_init(|| WayfireConfig {
			path: home_config_path(),
			cached: Mutex::new(None),
		})
	}

	/// An instance over a file of the caller's choosing, for the tests.
	#[cfg(test)]
	fn at(path: PathBuf) -> WayfireConfig {
		WayfireConfig {
			path: Ok(path),
			cached: Mutex::new(None),
		}
	}

	pub fn path(&self) -> Result<&Path, String> {
		self.path.as_deref().map_err(String::clone)
	}

	/// A poisoned lock means some other save panicked mid-way. The file itself
	/// is fine (nothing is written until the new copy is complete), so taking
	/// the guard anyway is better than refusing to save for the rest of the
	/// session.
	fn lock(&self) -> MutexGuard<'_, Option<Cached>> {
		self.cached.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn stamp(&self) -> Option<Stamp> {
		let path = self.path().ok()?;
		let metadata = fs::metadata(path).ok()?;
		Some((metadata.modified().ok()?, metadata.len()))
	}

	/// Reads the file, tolerating bytes that are not valid UTF-8.
	///
	/// `read_to_string` refuses the whole file over a single bad byte, and that
	/// is not a theoretical risk: a file whose head had been overwritten by
	/// something else left a comment cut in the middle of a multi-byte
	/// character, and with it every page that touches wayfire.ini stopped
	/// loading *and* saving. Wayfire itself reads the file byte by byte and
	/// does not care, so refusing to is a way of being stricter than the
	/// compositor for no gain. The broken bytes become replacement characters,
	/// which only ever appear inside comments in practice.
	fn read_from_disk(&self) -> Result<String, String> {
		let path = self.path()?;
		if !path.exists() {
			return Ok(String::new());
		}

		let bytes = fs::read(path).map_err(|e| {
			let msg = format!("Error leyendo wayfire.ini: {}", e);
			log_error(&msg);
			msg
		})?;

		match String::from_utf8(bytes) {
			Ok(content) => Ok(content),
			Err(error) => {
				log_error(&format!(
					"wayfire.ini tiene bytes inválidos en la posición {}; se leyó igual reemplazándolos",
					error.utf8_error().valid_up_to()
				));
				Ok(String::from_utf8_lossy(error.as_bytes()).into_owned())
			}
		}
	}

	/// Writes the new file beside the old one and renames it over the top.
	///
	/// The rename is the point: wayfire reloads this file whenever it changes,
	/// and a rename swaps it in one step, so the compositor reads either the
	/// whole old config or the whole new one. Writing in place would hand it
	/// whatever had made it to disk so far.
	fn write_to_disk(&self, content: &str) -> Result<(), String> {
		let path = self.path()?;

		if let Some(parent) = path.parent() {
			fs::create_dir_all(parent).map_err(|e| {
				let msg = format!("Error creando directorio: {}", e);
				log_error(&msg);
				msg
			})?;
		}

		let temporary = path.with_file_name(format!(
			"{}.tmp",
			path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
		));

		let write = || -> std::io::Result<()> {
			let mut file = fs::File::create(&temporary)?;
			file.write_all(content.as_bytes())?;
			// The rename is only atomic for the name; without this the contents
			// may still be in flight, and a power cut leaves an empty config.
			file.sync_all()?;

			if let Ok(existing) = fs::metadata(path) {
				let _ = fs::set_permissions(&temporary, existing.permissions());
			}

			fs::rename(&temporary, path)
		};

		write().map_err(|e| {
			let _ = fs::remove_file(&temporary);
			let msg = format!("Error escribiendo wayfire.ini: {}", e);
			log_error(&msg);
			msg
		})?;

		log_debug(&format!("wayfire.ini actualizado ({})", path.display()));
		Ok(())
	}

	/// The whole file, from memory when the copy we hold is still the one on
	/// disk. The stamp check is what keeps that honest even if the watcher
	/// never started.
	pub fn content(&self) -> Result<String, String> {
		let mut cached = self.lock();
		let stamp = self.stamp();

		if let Some(entry) = cached.as_ref() {
			if entry.stamp == stamp {
				return Ok(entry.content.clone());
			}
		}

		let content = self.read_from_disk()?;
		*cached = Some(Cached {
			content: content.clone(),
			stamp,
		});

		Ok(content)
	}

	pub fn section(&self, section: &str) -> Result<HashMap<String, String>, String> {
		Ok(parse_section(&self.content()?, section))
	}

	/// Applies `edit` to the file as one indivisible step: nothing else can
	/// read-modify-write it in between, which is the whole reason this type
	/// exists. Returns whether the file actually changed.
	///
	/// The current contents come from disk rather than from the cache, so a
	/// save is correct even when the watcher is not running.
	pub fn edit<F>(&self, edit: F) -> Result<bool, String>
	where
		F: FnOnce(&str) -> String,
	{
		let mut cached = self.lock();
		let current = self.read_from_disk()?;
		let updated = edit(&current);

		if updated == current {
			*cached = Some(Cached {
				content: current,
				stamp: self.stamp(),
			});
			return Ok(false);
		}

		self.write_to_disk(&updated)?;
		*cached = Some(Cached {
			content: updated,
			stamp: self.stamp(),
		});

		Ok(true)
	}

	/// Re-reads the file for the watcher, reporting whether what is on disk is
	/// something other than what we last read or wrote. Our own saves leave the
	/// cache holding exactly what was written, so they answer `false` here and
	/// the pages are not told to reload over a change they just made.
	fn refresh(&self) -> Result<bool, String> {
		let mut cached = self.lock();
		let content = self.read_from_disk()?;
		let changed = cached.as_ref().map(|entry| entry.content != content) == Some(true);

		*cached = Some(Cached {
			content,
			stamp: self.stamp(),
		});

		Ok(changed)
	}
}

fn home_config_path() -> Result<PathBuf, String> {
	let home = std::env::var("HOME")
		.map(PathBuf::from)
		.ok()
		.or_else(dirs::home_dir)
		.ok_or_else(|| {
			let msg = "No se pudo obtener el directorio home".to_string();
			log_error(&msg);
			msg
		})?;

	Ok(home.join(".config/wayfire.ini"))
}

/// Watches the file so that an edit made outside the application — by hand, or
/// by another tool — reaches the pages, instead of sitting on disk until
/// something overwrites it with what the screen still showed.
pub fn watch(app: AppHandle) {
	static WATCHER: OnceLock<Mutex<RecommendedWatcher>> = OnceLock::new();

	let config = WayfireConfig::global();
	let Ok(path) = config.path().map(Path::to_path_buf) else {
		return;
	};

	let watcher = watch_file(&path, move || match config.refresh() {
		Ok(true) => {
			log_debug("wayfire.ini cambió fuera de la aplicación");
			let _ = app.emit(CHANGED_EVENT, ());
		}
		Ok(false) => {}
		Err(error) => log_error(&format!("No se pudo releer wayfire.ini: {}", error)),
	});

	match watcher {
		// Dropping it stops the watching, so it has to outlive this call.
		Ok(watcher) => {
			let _ = WATCHER.set(Mutex::new(watcher));
			log_debug(&format!("Observando {}", path.display()));
		}
		Err(error) => log_error(&format!("No se pudo observar wayfire.ini: {}", error)),
	}
}

/// Calls `on_change` whenever `path` is touched.
///
/// It watches the *directory*, not the file: a save replaces the file by
/// renaming a new one over the old one, and a watch on the file alone follows
/// the inode — which after the first save is a file nobody will ever write to
/// again, so every later change would go unnoticed.
fn watch_file<F>(path: &Path, on_change: F) -> Result<RecommendedWatcher, String>
where
	F: Fn() + Send + 'static,
{
	let directory = path
		.parent()
		.ok_or_else(|| format!("{} no tiene directorio", path.display()))?
		.to_path_buf();
	let watched = path.to_path_buf();

	let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
		let Ok(event) = event else {
			return;
		};
		if event.paths.iter().any(|touched| touched == &watched) {
			on_change();
		}
	})
	.map_err(|error| error.to_string())?;

	watcher
		.watch(&directory, RecursiveMode::NonRecursive)
		.map_err(|error| format!("{}: {}", directory.display(), error))?;

	Ok(watcher)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::commands::wayfire_ini::update_section;
	use std::sync::atomic::{AtomicUsize, Ordering};
	use std::sync::Arc;

	/// The nine sections the Windows page saves in one click.
	const SECTIONS: [&str; 9] = [
		"grid",
		"move",
		"resize",
		"wm-actions",
		"core",
		"switcher",
		"fast-switcher",
		"place",
		"window-rules",
	];

	fn scratch(name: &str) -> PathBuf {
		static COUNTER: AtomicUsize = AtomicUsize::new(0);

		let path = std::env::temp_dir().join(format!(
			"vasak-settings-{}-{}-{}.ini",
			std::process::id(),
			COUNTER.fetch_add(1, Ordering::Relaxed),
			name
		));
		let _ = fs::remove_file(&path);
		path
	}

	fn seeded(name: &str) -> (WayfireConfig, PathBuf) {
		let path = scratch(name);
		let mut content = String::new();
		for section in SECTIONS {
			content.push_str(&format!("[{}]\nsaved = no\nuntouched = keep-me\n\n", section));
		}
		fs::write(&path, content).unwrap();
		(WayfireConfig::at(path.clone()), path)
	}

	fn save(config: &WayfireConfig, section: &str, key: &str, value: &str) {
		let values: HashMap<String, String> =
			[(key.to_string(), value.to_string())].into_iter().collect();
		config
			.edit(|content| update_section(content, section, &values, false))
			.unwrap();
	}

	/// The regression this whole type exists for: the page fires nine saves at
	/// once, and each one used to read the file, merge its section and write the
	/// whole thing back on its own — so the nine reads saw the same file and the
	/// last write won, throwing away eight of the nine saves.
	#[test]
	fn nine_saves_at_once_all_survive() {
		let (config, path) = seeded("concurrent");
		let config = Arc::new(config);

		let handles: Vec<_> = SECTIONS
			.iter()
			.map(|section| {
				let config = Arc::clone(&config);
				let section = section.to_string();
				std::thread::spawn(move || save(&config, &section, "saved", "yes"))
			})
			.collect();
		for handle in handles {
			handle.join().unwrap();
		}

		let written = fs::read_to_string(&path).unwrap();
		for section in SECTIONS {
			let values = parse_section(&written, section);
			assert_eq!(
				values.get("saved").map(String::as_str),
				Some("yes"),
				"[{}] lost its save:\n{}",
				section,
				written
			);
			assert_eq!(
				values.get("untouched").map(String::as_str),
				Some("keep-me"),
				"[{}] lost a key nobody was editing",
				section
			);
		}

		let _ = fs::remove_file(&path);
	}

	/// wayfire watches this file and reloads it on every change, and the next
	/// save reads it back to merge into it. Writing in place truncates first, so
	/// either of them could catch it half-written; renaming a finished file over
	/// the old one cannot be caught in between.
	#[test]
	fn a_reader_never_catches_the_file_half_written() {
		let (_config, path) = seeded("atomic");
		let complete = fs::read_to_string(&path).unwrap().len();

		let writer = {
			let path = path.clone();
			std::thread::spawn(move || {
				let config = WayfireConfig::at(path);
				for round in 0..300 {
					save(&config, "core", "saved", &format!("round-{}", round));
				}
			})
		};

		let mut reads = 0;
		while !writer.is_finished() {
			if let Ok(seen) = fs::read_to_string(&path) {
				reads += 1;
				assert!(
					seen.len() >= complete,
					"a reader saw {} bytes of a {}-byte file",
					seen.len(),
					complete
				);
				for section in SECTIONS {
					assert!(
						seen.contains(&format!("[{}]", section)),
						"[{}] was missing from a file read mid-save",
						section
					);
				}
			}
		}
		writer.join().unwrap();
		assert!(reads > 0, "the reader never got to look at the file");

		let _ = fs::remove_file(&path);
	}

	/// What decides whether the pages are told to reload: our own saves must not
	/// count as a change, or every save would bounce back as an external edit.
	#[test]
	fn only_a_change_made_elsewhere_counts_as_one() {
		let (config, path) = seeded("refresh");

		config.content().unwrap();
		save(&config, "core", "saved", "yes");
		assert_eq!(
			config.refresh(),
			Ok(false),
			"a save of our own is not an external change"
		);

		fs::write(&path, "[core]\nsaved = by-hand\n").unwrap();
		assert_eq!(config.refresh(), Ok(true), "a hand edit is");
		assert_eq!(
			config.section("core").unwrap().get("saved").map(String::as_str),
			Some("by-hand"),
			"and it is what the pages are handed afterwards"
		);

		let _ = fs::remove_file(&path);
	}

	/// The cached copy must not outlive the file it came from, watcher or no
	/// watcher — the stamp is what keeps a page from showing yesterday's file.
	#[test]
	fn an_edit_made_underneath_is_picked_up_without_the_watcher() {
		let (config, path) = seeded("stale");
		assert_eq!(
			config.section("core").unwrap().get("saved").map(String::as_str),
			Some("no")
		);

		// Same size, different content: only the modification time gives it away.
		fs::write(
			&path,
			fs::read_to_string(&path).unwrap().replace("saved = no", "saved = ok"),
		)
		.unwrap();

		assert_eq!(
			config.section("core").unwrap().get("saved").map(String::as_str),
			Some("ok")
		);

		let _ = fs::remove_file(&path);
	}

	#[test]
	fn a_save_that_changes_nothing_does_not_touch_the_file() {
		let (config, path) = seeded("noop");
		let before = fs::metadata(&path).unwrap().modified().unwrap();

		assert_eq!(config.edit(|content| content.to_string()), Ok(false));
		assert_eq!(
			fs::metadata(&path).unwrap().modified().unwrap(),
			before,
			"the file was rewritten for nothing"
		);

		let _ = fs::remove_file(&path);
	}

	/// The watching has to survive our own way of saving: the file the watcher
	/// was pointed at is replaced by a rename on every save, so a watch on the
	/// file itself would go deaf after the first one.
	#[test]
	fn the_watcher_still_hears_the_file_after_a_save_replaced_it() {
		use std::sync::mpsc;

		let (config, path) = seeded("watch");
		let (sender, receiver) = mpsc::channel();
		let _watcher = watch_file(&path, move || {
			let _ = sender.send(());
		})
		.expect("the watcher should start");

		for round in 0..3 {
			// A save of ours: writes a new file and renames it over the old one.
			save(&config, "core", "saved", &format!("round-{}", round));
			receiver
				.recv_timeout(std::time::Duration::from_secs(5))
				.unwrap_or_else(|_| panic!("no event for save {}", round));
		}

		// And an edit by something else entirely.
		fs::write(&path, "[core]\nsaved = by-hand\n").unwrap();
		receiver
			.recv_timeout(std::time::Duration::from_secs(5))
			.expect("no event for the hand edit");

		let _ = fs::remove_file(&path);
	}

	#[test]
	fn a_missing_file_is_created_by_the_first_save() {
		let path = scratch("missing");
		let config = WayfireConfig::at(path.clone());

		assert_eq!(config.content().unwrap(), "");
		save(&config, "input", "xkb_layout", "es");

		assert_eq!(
			parse_section(&fs::read_to_string(&path).unwrap(), "input")
				.get("xkb_layout")
				.map(String::as_str),
			Some("es")
		);

		let _ = fs::remove_file(&path);
	}
}
