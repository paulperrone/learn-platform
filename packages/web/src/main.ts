import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./pages/index.vue") },
    { path: "/learn", component: () => import("./pages/learn.vue") },
    { path: "/progress", component: () => import("./pages/progress.vue") },
    { path: "/explore", component: () => import("./pages/explore.vue") },
  ],
});

const app = createApp(App);
app.use(router);
app.mount("#app");
