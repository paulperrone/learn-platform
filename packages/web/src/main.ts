import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { authClient } from "./composables/useAuth";
import { i18n } from "./i18n";
import "./assets/main.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./pages/index.vue"), meta: { requiresAuth: true } },
    { path: "/queue", component: () => import("./pages/queue.vue"), meta: { requiresAuth: true } },
    { path: "/learn", component: () => import("./pages/learn.vue") },
    { path: "/assess", component: () => import("./pages/assess.vue"), meta: { requiresAuth: true } },
    { path: "/report/:disciplineId", component: () => import("./pages/report.vue"), meta: { requiresAuth: true } },
    { path: "/try", component: () => import("./pages/try.vue") },
    { path: "/onboarding", component: () => import("./pages/onboarding.vue"), meta: { requiresAuth: true } },
    { path: "/diagnostic/:disciplineId", component: () => import("./pages/diagnostic.vue") },
    { path: "/progress", component: () => import("./pages/progress.vue"), meta: { requiresAuth: true } },
    { path: "/explore", component: () => import("./pages/explore-index.vue") },
    { path: "/explore/:disciplineId", component: () => import("./pages/explore-discipline.vue") },
    { path: "/explore/:disciplineId/:topicId", component: () => import("./pages/explore-topic.vue") },
    { path: "/group", component: () => import("./pages/group.vue"), meta: { requiresAuth: true } },
    { path: "/group/:id", component: () => import("./pages/group-session.vue"), meta: { requiresAuth: true } },
    { path: "/teach", component: () => import("./pages/teach.vue") },
    { path: "/teach/:disciplineId/:topicId", component: () => import("./pages/teach-topic.vue") },
{ path: "/family", component: () => import("./pages/family.vue"), meta: { requiresAuth: true } },
    { path: "/family/child/:childId", component: () => import("./pages/family-child.vue"), meta: { requiresAuth: true, parentOnly: true } },
    { path: "/settings", component: () => import("./pages/settings.vue"), meta: { requiresAuth: true } },
    { path: "/admin", component: () => import("./pages/admin.vue"), meta: { requiresAuth: true, adminOnly: true } },
    { path: "/how-we-teach", component: () => import("./pages/how-we-teach.vue") },
    { path: "/docs", component: () => import("./pages/docs-index.vue") },
    { path: "/docs/mastery-learning", component: () => import("./pages/docs-mastery-learning.vue") },
    { path: "/docs/spaced-repetition", component: () => import("./pages/docs-spaced-repetition.vue") },
    { path: "/docs/knowledge-graph", component: () => import("./pages/docs-knowledge-graph.vue") },
    { path: "/docs/ai-tutoring", component: () => import("./pages/docs-ai-tutoring.vue") },
    { path: "/docs/comparison", component: () => import("./pages/docs-comparison.vue") },
    { path: "/license", component: () => import("./pages/license.vue") },
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

  // Block non-admin users from admin routes
  if (to.meta.adminOnly && (session.data.user as Record<string, unknown>)?.role !== "admin") {
    return { path: "/" };
  }
});

const app = createApp(App);
app.use(i18n);
app.use(router);
app.mount("#app");
