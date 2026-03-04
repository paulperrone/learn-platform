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
    { path: "/family", component: () => import("./pages/family.vue"), meta: { requiresAuth: true } },
    { path: "/family/child/:childId", component: () => import("./pages/family-child.vue"), meta: { requiresAuth: true, parentOnly: true } },
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

  // Block child accounts from parent-only routes
  if (to.meta.parentOnly && (session.data.user as Record<string, unknown>)?.managedBy) {
    return { path: "/" };
  }
});

const app = createApp(App);
app.use(router);
app.mount("#app");
