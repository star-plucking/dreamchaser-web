<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import eventLogo from './asserts/game_logo.jpg';
import associationLogo from './asserts/association_logo.png';

interface Team {
  id: number;
  name: string;
}

interface GroupSlot {
  position: number;
  team: Team | null;
}

interface Group {
  label: string;
  color: string;
  slots: GroupSlot[];
}

type Phase = 'seedSelection' | 'seedDraw' | 'regularDraw' | 'complete';

const loading = ref(true);
const error = ref<string | null>(null);
const teams = ref<Team[]>([]);

const selectedSeedIds = ref<number[]>([]);
const drawPhase = ref<Phase>('seedSelection');
const isDrawing = ref(false);
const spotlightTeam = ref<Team | null>(null);
const statusMessage = ref('请选择 4 支种子队伍开始抽签');
const drawHistory = ref<{ group: string; slot: number; team: Team }[]>([]);
const highlightPulseKey = ref(0);
const celebration = ref(false);

const groups = ref<Group[]>([
  {
    label: 'A',
    color: '#7f5af0',
    slots: [
      { position: 1, team: null },
      { position: 2, team: null },
      { position: 3, team: null }
    ]
  },
  {
    label: 'B',
    color: '#2cb67d',
    slots: [
      { position: 1, team: null },
      { position: 2, team: null },
      { position: 3, team: null }
    ]
  },
  {
    label: 'C',
    color: '#f25f4c',
    slots: [
      { position: 1, team: null },
      { position: 2, team: null },
      { position: 3, team: null }
    ]
  },
  {
    label: 'D',
    color: '#7cd2ff',
    slots: [
      { position: 1, team: null },
      { position: 2, team: null },
      { position: 3, team: null }
    ]
  }
]);

const seedTeams = computed(() => {
  return teams.value.filter((team) => selectedSeedIds.value.includes(team.id));
});

const regularTeams = computed(() => {
  return teams.value.filter((team) => !selectedSeedIds.value.includes(team.id));
});

const canConfirmSeeds = computed(() => selectedSeedIds.value.length === 4 && !isDrawing.value);

const isReadyToDraw = computed(() => drawPhase.value === 'seedSelection' && canConfirmSeeds.value);

const remainingSlots = computed(() =>
  groups.value.reduce((total, group) => {
    return (
      total +
      group.slots.reduce((count, slot) => {
        return count + (slot.team ? 0 : 1);
      }, 0)
    );
  }, 0)
);

onMounted(async () => {
  await loadTeams();
});

watch(celebration, (isActive) => {
  if (isActive) {
    setTimeout(() => {
      celebration.value = false;
    }, 2000);
  }
});

async function loadTeams() {
  try {
    const response = await fetch('teams.csv');
    if (!response.ok) {
      throw new Error('无法加载队伍列表');
    }
    const csvText = await response.text();
    teams.value = parseTeams(csvText);
    if (teams.value.length !== 12) {
      console.warn('队伍数量非 12 支，请检查 teams.csv');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '未知错误';
  } finally {
    loading.value = false;
  }
}

function parseTeams(csvText: string): Team[] {
  const rows = csvText
    .trim()
    .split(/\r?\n/)
    .slice(1);

  return rows
    .map((row) => {
      const [idRaw, nameRaw] = row.split(',');
      const id = Number(idRaw?.trim());
      const name = nameRaw?.trim() ?? '';
      if (!id || !name) {
        return null;
      }
      return { id, name };
    })
    .filter((team): team is Team => Boolean(team));
}

function ensureRandomTeam(source: Team[]): Team {
  const team = source[Math.floor(Math.random() * source.length)];
  if (!team) {
    throw new Error('抽签逻辑异常，请刷新页面重试。');
  }
  return team;
}

function toggleSeed(teamId: number) {
  if (drawPhase.value !== 'seedSelection' || isDrawing.value) {
    return;
  }
  const index = selectedSeedIds.value.indexOf(teamId);
  if (index >= 0) {
    selectedSeedIds.value.splice(index, 1);
  } else if (selectedSeedIds.value.length < 4) {
    selectedSeedIds.value.push(teamId);
  }
}

async function confirmSeeds() {
  if (!isReadyToDraw.value) {
    return;
  }

  isDrawing.value = true;
  celebration.value = false;
  drawHistory.value = [];
  spotlightTeam.value = null;
  statusMessage.value = '正在为种子队抽签...';
  drawPhase.value = 'seedDraw';

  resetGroups();

  try {
    await drawSlotSequence([...seedTeams.value], 1, '种子队');
    drawPhase.value = 'regularDraw';
    statusMessage.value = '正在为普通队伍抽签（二号位）...';
    const remaining = await drawSlotSequence([...regularTeams.value], 2, '二号位');
    statusMessage.value = '正在为普通队伍抽签（三号位）...';
    await drawSlotSequence(remaining, 3, '三号位');
    drawPhase.value = 'complete';
    statusMessage.value = '抽签完成！所有席位已确定。';
    celebration.value = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : '抽签过程中出现问题';
    statusMessage.value = message;
  } finally {
    setTimeout(() => {
      spotlightTeam.value = null;
    }, 1000);
    isDrawing.value = false;
  }
}

function resetGroups() {
  groups.value.forEach((group) => {
    group.slots.forEach((slot) => {
      slot.team = null;
    });
  });
}

async function drawSlotSequence(pool: Team[], slot: number, label: string) {
  if (pool.length === 0) {
    throw new Error('抽签池为空，请检查数据。');
  }

  let available = [...pool];
  const totalGroups = groups.value.length;

  if (available.length < totalGroups && slot === 1) {
    throw new Error('种子队数量不足 4 支，请重新选择。');
  }

  for (const group of groups.value) {
    if (available.length === 0) {
      throw new Error('抽签池数量不足，请检查流程。');
    }

    statusMessage.value = `正在抽取 ${group.label} 组的${label}...`;
    const pickedTeam = await animateRandomPick(available);
    assignTeamToGroup(group.label, slot, pickedTeam);
    drawHistory.value.unshift({ group: group.label, slot, team: pickedTeam });
    available = available.filter((team) => team.id !== pickedTeam.id);
    await wait(350);
  }

  return available;
}

async function animateRandomPick(available: Team[]) {
  if (available.length === 1) {
    const soloTeam = available[0];
    if (!soloTeam) {
      throw new Error('抽签逻辑异常，请刷新页面重试。');
    }
    spotlightTeam.value = soloTeam;
    highlightPulseKey.value++;
    await wait(600);
    return soloTeam;
  }

  const spinDuration = 2200 + Math.random() * 1200;
  const tick = 90;
  let elapsed = 0;

  return await new Promise<Team>((resolve) => {
    const interval = setInterval(() => {
      elapsed += tick;
      const randomTeam = ensureRandomTeam(available);
      spotlightTeam.value = randomTeam;
      highlightPulseKey.value++;

      if (elapsed >= spinDuration) {
        clearInterval(interval);
        const finalTeam = ensureRandomTeam(available);
        spotlightTeam.value = finalTeam;
        highlightPulseKey.value++;
        setTimeout(() => resolve(finalTeam), 500);
      }
    }, tick);
  });
}

function assignTeamToGroup(label: string, slot: number, team: Team) {
  const targetGroup = groups.value.find((group) => group.label === label);
  if (!targetGroup) {
    throw new Error(`未找到 ${label} 组`);
  }
  const targetSlot = targetGroup.slots.find((item) => item.position === slot);
  if (!targetSlot) {
    throw new Error(`未找到 ${label} 组的 ${slot} 号位`);
  }
  targetSlot.team = team;
}

function getSlotLabel(slot: number) {
  if (slot === 1) {
    return '种子队';
  }
  return `${slot}号位`;
}

function wait(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration));
}

function resetDraw() {
  if (isDrawing.value) {
    return;
  }
  selectedSeedIds.value = [];
  drawPhase.value = 'seedSelection';
  statusMessage.value = '请选择 4 支种子队伍开始抽签';
  drawHistory.value = [];
  celebration.value = false;
  spotlightTeam.value = null;
  resetGroups();
}
</script>

<template>
  <div class="app-shell">
    <div class="background-canvas">
      <div class="bg-gradient"></div>
      <div class="bg-glow bg-glow--one"></div>
      <div class="bg-glow bg-glow--two"></div>
      <div class="bg-glow bg-glow--three"></div>
      <div class="grid-overlay"></div>
    </div>

    <header class="hero">
      <div class="hero__content">
        <div class="hero__logos">
          <img class="hero__logo hero__logo--main" :src="eventLogo" alt="赛事 Logo" />
          <img class="hero__logo hero__logo--side" :src="associationLogo" alt="主办方 Logo" />
        </div>
        <div class="hero__text">
          <p class="hero__tag">北京理工大学「追梦杯」赛事组委会</p>
          <h1 class="hero__title">RAPID REACT：极速引擎</h1>
          <p class="hero__subtitle">抽签系统</p>
        </div>
      </div>
      <div class="hero__status">
        <div class="status-chip" :class="`status-chip--${drawPhase}`">
          <span v-if="drawPhase === 'seedSelection'">等待选择种子队</span>
          <span v-else-if="drawPhase === 'seedDraw'">种子队抽签进行中</span>
          <span v-else-if="drawPhase === 'regularDraw'">普通队抽签进行中</span>
          <span v-else>抽签完成</span>
        </div>
        <div class="slot-counter">
          <span class="slot-counter__number">{{ remainingSlots }}</span>
          <span class="slot-counter__label">剩余席位</span>
        </div>
      </div>
    </header>

    <main class="main-stage" :class="{ 'main-stage--loading': loading }">
      <transition name="fade">
        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          <p>加载队伍数据中...</p>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="error" class="error-banner">
          <p>{{ error }}</p>
          <button class="ghost-btn" @click="loadTeams">重试加载</button>
        </div>
      </transition>

      <section class="control-panel" :class="{ 'control-panel--disabled': drawPhase !== 'seedSelection' }">
        <div class="panel-header">
          <h2>选择四支种子队伍</h2>
          <p>
            请选择任意 4 支队伍作为种子队，他们将作为各组的 1 号席位。
            <span class="hint">当前已选择 {{ selectedSeedIds.length }} 支。</span>
          </p>
        </div>
        <div class="team-grid">
          <button v-for="team in teams" :key="team.id" type="button" class="team-card" :class="{
            'team-card--selected': selectedSeedIds.includes(team.id),
            'team-card--locked': drawPhase !== 'seedSelection'
          }" @click="toggleSeed(team.id)">
            <span class="team-card__index">#{{ team.id.toString().padStart(2, '0') }}</span>
            <span class="team-card__name">{{ team.name }}</span>
            <span class="team-card__tag" v-if="selectedSeedIds.includes(team.id)">种子候选</span>
          </button>
        </div>

        <div class="panel-actions">
          <button class="primary-btn" :disabled="!isReadyToDraw" @click="confirmSeeds">
            <span>开始极速抽签</span>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
          <button class="ghost-btn" :disabled="isDrawing" @click="resetDraw">重置选择</button>
        </div>
      </section>

      <section class="status-board">
        <div class="status-card" :class="{ 'status-card--busy': isDrawing }">
          <div class="status-card__title">抽签状态</div>
          <div class="status-card__body">
            <transition name="spotlight" mode="out-in">
              <div v-if="spotlightTeam" class="spotlight" :key="`spotlight-${highlightPulseKey}-${spotlightTeam.id}`">
                <span class="spotlight__label">聚焦队伍</span>
                <span class="spotlight__name">{{ spotlightTeam.name }}</span>
              </div>
              <div v-else class="status-card__message" key="status-message">
                {{ statusMessage }}
              </div>
            </transition>
          </div>
        </div>
        <div class="history-card" v-if="drawHistory.length">
          <div class="history-card__title">抽签记录</div>
          <transition-group name="pop" tag="ul" class="history-list">
            <li v-for="record in drawHistory" :key="`${record.group}-${record.slot}-${record.team.id}`">
              <span class="history-list__group">组别 {{ record.group }}</span>
              <span class="history-list__slot">{{ getSlotLabel(record.slot) }}</span>
              <span class="history-list__team">{{ record.team.name }}</span>
            </li>
          </transition-group>
        </div>
      </section>

      <section class="groups-display">
        <h2 class="groups-display__title">分组结果一览</h2>
        <div class="group-grid">
          <div v-for="group in groups" :key="group.label" class="group-card" :style="{ '--group-color': group.color }">
            <div class="group-card__header">
              <span class="group-card__badge">{{ group.label }}</span>
              <span class="group-card__label">Group {{ group.label }}</span>
            </div>
            <div class="group-card__body">
              <div v-for="slot in group.slots" :key="slot.position" class="group-slot"
                :class="{ 'group-slot--filled': slot.team }">
                <div class="group-slot__meta">
                  <span class="group-slot__position">{{ getSlotLabel(slot.position) }}</span>
                  <span class="group-slot__divider"></span>
                </div>
                <div class="group-slot__content">
                  <transition name="fade" mode="out-in">
                    <div v-if="slot.team" class="group-slot__team" :key="`team-${slot.team.id}`">
                      <span class="group-slot__team-index">#{{ slot.team.id.toString().padStart(2, '0') }}</span>
                      <span class="group-slot__team-name">{{ slot.team.name }}</span>
                    </div>
                    <div v-else class="group-slot__placeholder" key="placeholder">等待抽签</div>
                  </transition>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <p>© {{ new Date().getFullYear() }} 北京理工大学「追梦杯」赛事组委会 抽签系统</p>
    </footer>

    <transition name="celebration">
      <div v-if="celebration" class="celebration-overlay">
        <div class="celebration-overlay__content">
          <h2>抽签完成！</h2>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: #05070f;
  font-family: 'Orbitron', 'Segoe UI', 'Microsoft YaHei', sans-serif;
  color: #ffffff;
}

:global(*),
:global(*::before),
:global(*::after) {
  box-sizing: border-box;
}

.app-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.background-canvas {
  position: fixed;
  inset: 0;
  overflow: hidden;
  z-index: -3;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(127, 90, 240, 0.4), transparent 55%),
    radial-gradient(circle at 80% 10%, rgba(44, 182, 125, 0.35), transparent 50%),
    radial-gradient(circle at 50% 80%, rgba(124, 210, 255, 0.35), transparent 60%);
  filter: blur(40px);
  animation: gradientMove 16s ease-in-out infinite alternate;
}

.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.6;
  animation: glowPulse 12s ease-in-out infinite;
}

.bg-glow--one {
  width: 420px;
  height: 420px;
  top: 10%;
  left: 12%;
  background: rgba(127, 90, 240, 0.45);
}

.bg-glow--two {
  width: 380px;
  height: 380px;
  bottom: 15%;
  right: 10%;
  background: rgba(44, 182, 125, 0.45);
  animation-delay: -4s;
}

.bg-glow--three {
  width: 340px;
  height: 340px;
  bottom: 8%;
  left: 28%;
  background: rgba(242, 95, 76, 0.35);
  animation-delay: -7s;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.35), transparent 70%);
  opacity: 0.3;
}

.hero {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 48px clamp(32px, 6vw, 80px) 32px;
}

.hero__content {
  display: flex;
  gap: clamp(24px, 4vw, 48px);
  align-items: center;
}

.hero__logos {
  position: relative;
  display: grid;
  gap: 16px;
}

.hero__logo {
  width: clamp(120px, 18vw, 200px);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 20px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}

.hero__logo--main {
  animation: float 6s ease-in-out infinite;
}

.hero__logo--side {
  width: clamp(120px, 18vw, 200px);
  opacity: 0.8;
  animation: float 7s ease-in-out infinite alternate;
}

.hero__text {
  display: grid;
  gap: 12px;
}

.hero__tag {
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.hero__title {
  margin: 0;
  font-size: clamp(2.6rem, 5vw, 3.8rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.hero__subtitle {
  margin: 0;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.7);
  max-width: 520px;
}

.hero__status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 16px;
}

.status-chip {
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
}

.status-chip--seedSelection {
  color: #7cd2ff;
}

.status-chip--seedDraw {
  color: #f8f991;
}

.status-chip--regularDraw {
  color: #2cb67d;
}

.status-chip--complete {
  color: #f25f4c;
}

.slot-counter {
  display: grid;
  justify-items: center;
  padding: 12px 20px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(127, 90, 240, 0.2), rgba(124, 210, 255, 0.15));
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
}

.slot-counter__number {
  font-size: 2rem;
  font-weight: 700;
}

.slot-counter__label {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.7;
}

.main-stage {
  position: relative;
  z-index: 2;
  display: grid;
  gap: clamp(32px, 5vw, 48px);
  padding: 0 clamp(32px, 6vw, 80px) clamp(48px, 8vw, 96px);
}

.main-stage--loading {
  pointer-events: none;
  opacity: 0.6;
}

.loading {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 32px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
}

.spinner {
  width: 42px;
  height: 42px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #7f5af0;
  border-radius: 50%;
  animation: spin 1.1s linear infinite;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-radius: 16px;
  background: rgba(242, 95, 76, 0.12);
  border: 1px solid rgba(242, 95, 76, 0.4);
}

.control-panel {
  display: grid;
  gap: 24px;
  padding: clamp(24px, 4vw, 36px);
  border-radius: 28px;
  background: rgba(8, 12, 24, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
  transition: opacity 0.5s ease;
}

.control-panel--disabled {
  pointer-events: none;
  opacity: 0.45;
}

.panel-header h2 {
  margin: 0 0 8px;
  font-size: 1.8rem;
}

.panel-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
}

.hint {
  color: #f8f991;
  margin-left: 8px;
}

.team-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.team-card {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 18px 16px;
  border-radius: 18px;
  background: rgba(12, 20, 38, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  transition: transform 0.3s ease, border 0.3s ease, box-shadow 0.3s ease;
  overflow: hidden;
}

.team-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(127, 90, 240, 0.22), rgba(44, 182, 125, 0.22));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.team-card:hover {
  transform: translateY(-4px);
  border-color: rgba(124, 210, 255, 0.6);
  box-shadow: 0 18px 36px rgba(124, 210, 255, 0.25);
}

.team-card:hover::after {
  opacity: 1;
}

.team-card--selected {
  border-color: rgba(248, 249, 145, 0.8);
  box-shadow: 0 20px 40px rgba(248, 249, 145, 0.22);
}

.team-card--selected::after {
  opacity: 0.8;
}

.team-card--locked {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none !important;
  box-shadow: none !important;
}

.team-card__index {
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  position: relative;
  z-index: 1;
}

.team-card__name {
  position: relative;
  z-index: 1;
  font-size: 1.1rem;
  font-weight: 600;
}

.team-card__tag {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(248, 249, 145, 0.85);
  color: #0a0d17;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  z-index: 1;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.primary-btn,
.ghost-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  border-radius: 16px;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  border: none;
  transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease;
}

.primary-btn {
  background: linear-gradient(120deg, #7f5af0, #2cb67d);
  color: #0a0d17;
  font-weight: 700;
}

.primary-btn svg {
  width: 20px;
  height: 20px;
}

.primary-btn:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 18px 38px rgba(127, 90, 240, 0.32);
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.ghost-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(255, 255, 255, 0.14);
}

.ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-board {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.status-card,
.history-card {
  padding: 24px;
  border-radius: 24px;
  background: rgba(10, 15, 28, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 46px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-card--busy {
  border-color: rgba(124, 210, 255, 0.5);
  box-shadow: 0 25px 50px rgba(124, 210, 255, 0.18);
}

.status-card {
  height: 320px;
}

.status-card__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.status-card__title,
.history-card__title {
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}

.status-card__message {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.6;
  text-align: center;
  letter-spacing: 0.04em;
}

.spotlight {
  padding: 18px 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(127, 90, 240, 0.4), rgba(44, 182, 125, 0.28));
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.15);
  display: grid;
  gap: 6px;
  justify-items: center;
  text-align: center;
}

.spotlight__label {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.75;
}

.spotlight__name {
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.history-card {
  height: 320px;
  overflow: hidden;
}

.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}

.history-list li {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.95rem;
  align-items: center;
}

.history-list__group {
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7f5af0;
}

.history-list__slot {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.history-list__team {
  font-weight: 600;
}

.groups-display {
  display: grid;
  gap: 24px;
}

.groups-display__title {
  margin: 0;
  font-size: 1.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}

.group-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.group-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  background: rgba(12, 12, 24, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 52px rgba(0, 0, 0, 0.36);
  display: grid;
  grid-template-rows: auto 1fr;
}

.group-card::before {
  content: '';
  position: absolute;
  inset: -40% 10% 30%;
  background: radial-gradient(circle, var(--group-color), transparent 55%);
  filter: blur(40px);
  opacity: 0.55;
  transform: rotate(12deg);
}

.group-card__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
}

.group-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.group-card__label {
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.group-card__body {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 16px;
  padding: 0 20px 24px;
}

.group-slot {
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 8px;
  min-height: 80px;
  transition: transform 0.4s ease, border 0.4s ease, box-shadow 0.4s ease;
}

.group-slot--filled {
  border-color: rgba(248, 249, 145, 0.6);
  box-shadow: 0 18px 34px rgba(248, 249, 145, 0.18);
  transform: translateY(-2px);
}

.group-slot__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-slot__content {
  min-height: 24px;
  position: relative;
}

.group-slot__position {
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.group-slot__divider {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.4), transparent);
}

.group-slot__team {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-height: 24px;
}

.group-slot__team-index {
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.group-slot__team-name {
  font-size: 1.1rem;
  font-weight: 600;
}

.group-slot__placeholder {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.4);
  min-height: 24px;
  display: flex;
  align-items: center;
}

.footer {
  position: relative;
  z-index: 2;
  padding: 32px clamp(32px, 6vw, 80px) 48px;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.celebration-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(5, 7, 15, 0.85);
  backdrop-filter: blur(8px);
  z-index: 10;
  animation: overlayFade 0.6s ease forwards;
}

.celebration-overlay__content {
  text-align: center;
  display: grid;
  gap: 12px;
  background: rgba(0, 0, 0, 0.55);
  padding: 32px 48px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
  animation: celebrationPop 0.8s ease;
}

.celebration-overlay__content h2 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: 0.12em;
}

.celebration-overlay__content p {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.08em;
}

@keyframes gradientMove {
  0% {
    transform: translate3d(-40px, -20px, 0) scale(1);
  }

  50% {
    transform: translate3d(30px, 25px, 0) scale(1.05);
  }

  100% {
    transform: translate3d(-20px, 10px, 0) scale(1);
  }
}

@keyframes glowPulse {

  0%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }

  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}

@keyframes float {

  0%,
  100% {
    transform: translateY(0px);
  }

  50% {
    transform: translateY(-12px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes overlayFade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes celebrationPop {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }

  60% {
    transform: scale(1.05);
    opacity: 1;
  }

  100% {
    transform: scale(1);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.spotlight-enter-active,
.spotlight-leave-active {
  transition: all 0.4s ease;
}

.spotlight-enter-from,
.spotlight-leave-to {
  transform: translateY(10px);
  opacity: 0;
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.35s ease;
}

.pop-enter-from,
.pop-leave-to {
  transform: translateY(6px);
  opacity: 0;
}

.celebration-enter-active,
.celebration-leave-active {
  transition: opacity 0.4s ease;
}

.celebration-enter-from,
.celebration-leave-to {
  opacity: 0;
}

@media (max-width: 1024px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 32px;
  }

  .hero__status {
    flex-direction: row;
    gap: 18px;
  }

  .group-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}

@media (max-width: 768px) {
  .hero {
    padding: 36px 24px 24px;
  }

  .hero__content {
    flex-direction: column;
    align-items: flex-start;
  }

  .main-stage {
    padding: 0 24px 48px;
    gap: 20px;
  }

  .team-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .group-grid {
    grid-template-columns: 1fr;
  }
}
</style>
