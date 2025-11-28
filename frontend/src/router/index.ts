import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import CreatePlanetView from '../views/CreatePlanetView.vue';
import ForbiddenView from '../views/ForbiddenView.vue';
import SessionView from '../views/SessionView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'forbidden', component: ForbiddenView },
  { path: '/create-planet', name: 'create-planet', component: CreatePlanetView },
  { path: '/session/:id', name: 'session', component: SessionView }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
