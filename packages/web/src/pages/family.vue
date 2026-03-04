<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useApi, withErrorToast, ApiError } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useToast } from "@/composables/useToast";

const { isChild: isChildAccount } = useAuth();

const api = useApi();
const toast = useToast();

// State
const loading = ref(true);
const hasFamily = ref(false);
const family = ref<any>(null);
const members = ref<any[]>([]);
const currentUserRole = ref("");
const childrenProgress = ref<{ childId: string; name: string; stats: any }[]>([]);

// Setup form
const familyName = ref("");
const creatingFamily = ref(false);

// Add child form
const showAddChild = ref(false);
const childForm = ref({ name: "", email: "", password: "", birthYear: undefined as number | undefined });
const addingChild = ref(false);

// Usage tracking
const usageData = ref<{
  children: { childId: string; name: string; costCents: number; calls: number }[];
  totalCostCents: number;
  monthlyBudgetCents: number | null;
}>({ children: [], totalCostCents: 0, monthlyBudgetCents: null });
const showBudgetForm = ref(false);
const budgetInput = ref<number | undefined>(undefined);
const savingBudget = ref(false);

const currentYear = new Date().getFullYear();

const isParent = computed(() => currentUserRole.value === "owner");

const budgetPercent = computed(() => {
  const budget = usageData.value.monthlyBudgetCents;
  if (!budget) return 0;
  return Math.min(100, Math.round((usageData.value.totalCostCents / budget) * 100));
});

const budgetWarning = computed(() => budgetPercent.value >= 80);
const budgetExceeded = computed(() => budgetPercent.value >= 100);

const children = computed(() =>
  members.value.filter((m) => m.managedBy !== null)
);

async function loadFamily() {
  loading.value = true;
  try {
    const data = await api.getFamily();
    hasFamily.value = true;
    family.value = data.family;
    members.value = data.members;
    currentUserRole.value = data.currentUserRole;

    if (data.currentUserRole === "owner") {
      const [progress, usage] = await Promise.all([
        api.getFamilyProgress(),
        api.getFamilyUsage(),
      ]);
      childrenProgress.value = progress.children;
      usageData.value = usage;
      budgetInput.value = usage.monthlyBudgetCents != null
        ? Math.round(usage.monthlyBudgetCents / 100)
        : undefined;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      hasFamily.value = false;
    } else {
      toast.error("Failed to load family data");
    }
  }
  loading.value = false;
}

async function handleCreateFamily() {
  if (!familyName.value.trim()) return;
  creatingFamily.value = true;

  const result = await withErrorToast(
    () => api.createFamily(familyName.value.trim()),
    "Failed to create family"
  );

  if (result) {
    familyName.value = "";
    await loadFamily();
  }
  creatingFamily.value = false;
}

async function handleAddChild() {
  if (!childForm.value.name || !childForm.value.email || !childForm.value.password) return;
  addingChild.value = true;

  const result = await withErrorToast(
    () => api.addChild({
      name: childForm.value.name,
      email: childForm.value.email,
      password: childForm.value.password,
      birthYear: childForm.value.birthYear,
    }),
    "Failed to add child"
  );

  if (result) {
    toast.success(`${result.child.name} added to family`);
    childForm.value = { name: "", email: "", password: "", birthYear: undefined };
    showAddChild.value = false;
    await loadFamily();
  }
  addingChild.value = false;
}

function getChildStats(childId: string) {
  return childrenProgress.value.find((c) => c.childId === childId)?.stats ?? {
    mastered: 0,
    inProgress: 0,
    dueForReview: 0,
    total: 0,
  };
}

function progressPercent(stats: any) {
  return stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function handleSaveBudget() {
  savingBudget.value = true;
  const cents = budgetInput.value != null && budgetInput.value > 0
    ? Math.round(budgetInput.value * 100)
    : null;

  const result = await withErrorToast(
    () => api.setFamilyBudget(cents),
    "Failed to save budget"
  );

  if (result) {
    usageData.value.monthlyBudgetCents = result.monthlyBudgetCents;
    showBudgetForm.value = false;
    toast.success(cents ? `Monthly budget set to ${formatCents(cents)}` : "Budget limit removed");
  }
  savingBudget.value = false;
}

onMounted(loadFamily);
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading...</span>
    </div>

    <!-- No Family: Child account without family -->
    <div v-else-if="!hasFamily && isChildAccount" class="flex min-h-[50vh] items-center justify-center">
      <div class="text-center max-w-sm">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">No Family Yet</h1>
        <p class="text-sm text-gray-500 mb-4">Your parent hasn't added you to a family yet. In the meantime, keep learning!</p>
        <RouterLink to="/learn" class="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
          Start Learning
        </RouterLink>
      </div>
    </div>

    <!-- No Family: Setup Flow (parents only) -->
    <div v-else-if="!hasFamily" class="flex min-h-[50vh] items-center justify-center">
      <div class="w-full max-w-md space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-gray-900">Create Your Family</h1>
          <p class="mt-2 text-sm text-gray-500">
            Set up a family account to manage your children's learning and track their progress.
          </p>
        </div>

        <form @submit.prevent="handleCreateFamily" class="space-y-4">
          <div>
            <label for="familyName" class="block text-sm font-medium text-gray-700">Family Name</label>
            <input
              id="familyName"
              v-model="familyName"
              type="text"
              required
              placeholder="e.g. The Perrone Family"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            :disabled="creatingFamily || !familyName.trim()"
            class="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {{ creatingFamily ? "Creating..." : "Create Family" }}
          </button>
        </form>
      </div>
    </div>

    <!-- Has Family: Dashboard -->
    <template v-else>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-bold">{{ family.name }}</h1>
        <span class="text-sm text-gray-400">{{ isParent ? "Parent" : "Member" }}</span>
      </div>

      <!-- Parent Dashboard -->
      <template v-if="isParent">
        <!-- Children Overview -->
        <div class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-800">Children</h2>
            <button
              @click="showAddChild = !showAddChild"
              class="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {{ showAddChild ? "Cancel" : "+ Add Child" }}
            </button>
          </div>

          <!-- Add Child Form -->
          <div v-if="showAddChild" class="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 class="font-medium text-gray-800 mb-4">Add a Child</h3>
            <form @submit.prevent="handleAddChild" class="space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    v-model="childForm.name"
                    type="text"
                    required
                    placeholder="Child's name"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    v-model="childForm.email"
                    type="email"
                    required
                    placeholder="child@example.com"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    v-model="childForm.password"
                    type="password"
                    required
                    minlength="8"
                    placeholder="At least 8 characters"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">
                    Birth Year <span class="text-gray-400">(optional)</span>
                  </label>
                  <input
                    v-model.number="childForm.birthYear"
                    type="number"
                    :min="currentYear - 20"
                    :max="currentYear"
                    placeholder="e.g. 2018"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="addingChild"
                  class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {{ addingChild ? "Adding..." : "Add Child" }}
                </button>
              </div>
            </form>
          </div>

          <!-- Children Cards -->
          <div v-if="children.length === 0 && !showAddChild" class="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p class="text-gray-500 mb-3">No children added yet.</p>
            <button
              @click="showAddChild = true"
              class="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Add your first child
            </button>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <RouterLink
              v-for="child in children"
              :key="child.userId"
              :to="`/family/child/${child.userId}`"
              class="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                  {{ child.name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <p class="font-medium text-gray-800">{{ child.name }}</p>
                  <p v-if="child.birthYear" class="text-xs text-gray-400">Born {{ child.birthYear }}</p>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">Progress</span>
                  <span class="font-medium text-gray-700">{{ progressPercent(getChildStats(child.userId)) }}%</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2">
                  <div
                    class="bg-green-500 h-2 rounded-full transition-all"
                    :style="{ width: progressPercent(getChildStats(child.userId)) + '%' }"
                  />
                </div>
                <div class="flex gap-4 text-xs text-gray-400">
                  <span>{{ getChildStats(child.userId).mastered }} mastered</span>
                  <span>{{ getChildStats(child.userId).inProgress }} active</span>
                  <span>{{ getChildStats(child.userId).dueForReview }} due</span>
                </div>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Family Summary -->
        <div v-if="childrenProgress.length > 0" class="bg-white rounded-lg border border-gray-200 p-5 mb-8">
          <h2 class="font-semibold text-gray-800 mb-4">Family Summary</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-gray-500">Children</p>
              <p class="text-2xl font-bold text-gray-800">{{ childrenProgress.length }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Total Mastered</p>
              <p class="text-2xl font-bold text-green-600">
                {{ childrenProgress.reduce((sum, c) => sum + (c.stats?.mastered ?? 0), 0) }}
              </p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Total In Progress</p>
              <p class="text-2xl font-bold text-blue-600">
                {{ childrenProgress.reduce((sum, c) => sum + (c.stats?.inProgress ?? 0), 0) }}
              </p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Due for Review</p>
              <p class="text-2xl font-bold text-orange-600">
                {{ childrenProgress.reduce((sum, c) => sum + (c.stats?.dueForReview ?? 0), 0) }}
              </p>
            </div>
          </div>
        </div>

        <!-- LLM Usage -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-gray-800">AI Tutoring Usage</h2>
            <button
              @click="showBudgetForm = !showBudgetForm"
              class="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {{ showBudgetForm ? "Cancel" : "Set Budget" }}
            </button>
          </div>

          <!-- Budget Form -->
          <div v-if="showBudgetForm" class="mb-4 p-4 bg-gray-50 rounded-lg">
            <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Budget (USD)</label>
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  v-model.number="budgetInput"
                  type="number"
                  min="0"
                  step="0.50"
                  placeholder="e.g. 5.00"
                  class="pl-7 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                @click="handleSaveBudget"
                :disabled="savingBudget"
                class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {{ savingBudget ? "Saving..." : "Save" }}
              </button>
              <button
                v-if="usageData.monthlyBudgetCents !== null"
                @click="budgetInput = undefined; handleSaveBudget()"
                class="text-sm text-red-600 hover:text-red-700"
              >
                Remove limit
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-2">Leave empty or set to 0 to remove the budget limit. When the limit is reached, AI tutoring pauses but learning continues.</p>
          </div>

          <!-- Budget Progress Bar -->
          <div v-if="usageData.monthlyBudgetCents !== null" class="mb-4">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-gray-600">This Month</span>
              <span :class="budgetExceeded ? 'text-red-600 font-medium' : budgetWarning ? 'text-orange-600' : 'text-gray-600'">
                {{ formatCents(usageData.totalCostCents) }} / {{ formatCents(usageData.monthlyBudgetCents) }}
              </span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2.5">
              <div
                class="h-2.5 rounded-full transition-all"
                :class="budgetExceeded ? 'bg-red-500' : budgetWarning ? 'bg-orange-400' : 'bg-blue-500'"
                :style="{ width: budgetPercent + '%' }"
              />
            </div>
            <p v-if="budgetExceeded" class="text-xs text-red-600 mt-1">Budget exceeded — AI tutoring is paused.</p>
            <p v-else-if="budgetWarning" class="text-xs text-orange-600 mt-1">Approaching budget limit.</p>
          </div>

          <!-- No budget set -->
          <div v-else class="mb-4">
            <p class="text-sm text-gray-500">
              Total this month: <span class="font-medium text-gray-700">{{ formatCents(usageData.totalCostCents) }}</span>
              <span class="text-gray-400"> &middot; No budget limit set</span>
            </p>
          </div>

          <!-- Per-child usage breakdown -->
          <div v-if="usageData.children.length > 0">
            <h3 class="text-sm font-medium text-gray-600 mb-2">By Child</h3>
            <div class="space-y-2">
              <div
                v-for="child in usageData.children"
                :key="child.childId"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-gray-700">{{ child.name }}</span>
                <span class="text-gray-500">
                  {{ formatCents(child.costCents) }}
                  <span class="text-gray-400">({{ child.calls }} calls)</span>
                </span>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-400">No AI tutoring usage this month.</p>
        </div>
      </template>

      <!-- Member (Child) View -->
      <template v-else>
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <p class="text-gray-600">
            You're part of the <strong>{{ family.name }}</strong> family.
          </p>
          <div class="mt-4">
            <RouterLink to="/learn" class="text-blue-600 hover:underline text-sm font-medium">
              Continue Learning
            </RouterLink>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
