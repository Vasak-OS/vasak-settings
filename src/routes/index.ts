import { createMemoryHistory, createRouter } from 'vue-router';

const routes = [
	{ path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
	{
		path: '/appearance-theme',
		name: 'appearance-theme',
		component: () => import('@/views/AppearanceThemeView.vue'),
	},
	{
		path: '/appearance-wallpaper',
		name: 'appearance-wallpaper',
		component: () => import('@/views/WallpaperView.vue'),
	},
];
export const router = createRouter({
	history: createMemoryHistory(),
	routes,
});
