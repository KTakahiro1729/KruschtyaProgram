import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import vue3GoogleLogin from 'vue3-google-login';
import App from './App.vue';
import './style.css';
import LobbyView from './views/LobbyView.vue';
import SessionView from './views/SessionView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'lobby', component: LobbyView },
    { path: '/session/:id', name: 'session', component: SessionView }
  ]
});

const app = createApp(App);
app.use(router);
app.use(vue3GoogleLogin, { clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID });
app.mount('#app');
