export interface SidebarItem {
	id: string;
	label: string;
	icon?: string;
	badge?: string | number;
	disabled?: boolean;
}

export interface SidebarCategory {
	id: string;
	title: string;
	items: SidebarItem[];
}
