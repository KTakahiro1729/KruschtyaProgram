import { createApp } from 'vue';
import vue3GoogleLogin from 'vue3-google-login';
import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);
app.use(router);

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (googleClientId) {
  app.use(vue3GoogleLogin, { clientId: googleClientId });
} else {
  console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Login is disabled.');
}

app.mount('#app');
