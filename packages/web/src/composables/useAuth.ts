import { computed } from "vue";
import { createAuthClient } from "better-auth/vue";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

export function useAuth() {
  const session = authClient.useSession();

  const user = computed(() => session.value?.data?.user ?? null);
  const isPending = computed(() => session.value?.isPending ?? true);
  const isAuthenticated = computed(() => !!user.value);

  return {
    session,
    user,
    isPending,
    isAuthenticated,

    signUp: (email: string, password: string, name: string, birthYear?: number) =>
      authClient.signUp.email({
        email,
        password,
        name,
        ...(birthYear != null ? { birthYear } : {}),
      } as Parameters<typeof authClient.signUp.email>[0]),

    signIn: (email: string, password: string) =>
      authClient.signIn.email({ email, password }),

    signOut: () => authClient.signOut(),
  };
}
