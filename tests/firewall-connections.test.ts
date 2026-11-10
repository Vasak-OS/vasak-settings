import { describe, expect, test } from 'bun:test';
import type { ObservedConnection } from '../src/services/permissions.service';
import { destinationLabel, groupConnections } from '../src/utils/firewall-connections';

const conn = (over: Partial<ObservedConnection>): ObservedConnection => ({
	uid: 1000,
	binary_path: '/usr/bin/app',
	ip: '93.184.216.34',
	port: 443,
	proto: 'tcp',
	allowed: true,
	domain: '',
	last_seen_secs: 0,
	...over,
});

describe('destinationLabel', () => {
	test('con dominio se muestra el dominio y no la IP', () => {
		expect(destinationLabel(conn({ domain: 'example.com' }))).toBe('example.com:443');
	});

	test('sin dominio se muestra la IP', () => {
		expect(destinationLabel(conn({ domain: '' }))).toBe('93.184.216.34:443');
	});

	test('una IPv6 sin dominio va entre corchetes', () => {
		expect(destinationLabel(conn({ ip: '2606:2800::1', port: 80 }))).toBe('[2606:2800::1]:80');
	});

	test('dos dominios para la misma IP se distinguen por el dominio', () => {
		const a = destinationLabel(conn({ domain: 'a.test' }));
		const b = destinationLabel(conn({ domain: 'b.test' }));
		expect([a, b]).toEqual(['a.test:443', 'b.test:443']);
	});
});

describe('groupConnections', () => {
	test('una lista vacía no da grupos', () => {
		expect(groupConnections([])).toEqual([]);
	});

	test('agrupa por aplicación', () => {
		const groups = groupConnections([
			conn({ binary_path: '/a', last_seen_secs: 1 }),
			conn({ binary_path: '/b', last_seen_secs: 2 }),
			conn({ binary_path: '/a', port: 80, last_seen_secs: 3 }),
		]);
		expect(groups.map((g) => [g.binaryPath, g.connections.length])).toEqual([
			['/a', 2],
			['/b', 1],
		]);
	});

	test('ordena la app con la conexión más reciente primero, y las conexiones dentro del grupo', () => {
		const groups = groupConnections([
			conn({ binary_path: '/vieja', last_seen_secs: 10 }),
			conn({ binary_path: '/nueva', port: 1, last_seen_secs: 20 }),
			conn({ binary_path: '/nueva', port: 2, last_seen_secs: 90 }),
			conn({ binary_path: '/nueva', port: 3, last_seen_secs: 50 }),
		]);
		expect(groups.map((g) => g.binaryPath)).toEqual(['/nueva', '/vieja']);
		expect(groups[0].connections.map((c) => c.port)).toEqual([2, 3, 1]);
	});
});
