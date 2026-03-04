import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { authClient } from "./composables/useAuth";
import "./assets/main.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./pages/index.vue"), meta: { requiresAuth: true } },
    { path: "/learn", component: () => import("./pages/learn.vue"), meta: { requiresAuth: true } },
    { path: "/progress", component: () => import("./pages/progress.vue"), meta: { requiresAuth: true } },
    { path: "/explore", component: () => import("./pages/explore.vue"), meta: { requiresAuth: true } },
    { path: "/login", component: () => import("./pages/login.vue") },
    { path: "/signup", component: () => import("./pages/signup.vue") },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return;

  const session = await authClient.getSession();
  if (!session.data) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
});

const app = createApp(App);
app.use(router);
app.mount("#app");
