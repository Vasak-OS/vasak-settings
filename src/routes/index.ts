import { createMemoryHistory, createRouter } from 'vue-router';

const routes = [{ path: '/', name: 'home', component: () => import('@/views/HomeView.vue') }];

export const router = createRouter({
	history: createMemoryHistory(),
	routes,
});
