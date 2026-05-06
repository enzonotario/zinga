<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  coverUrl?: string
  title?: string
  artist?: string
  year?: number | string
  isPlaying?: boolean
  progress?: number
  trackCount?: number
  currentTrackNumber?: number
  plinthTexture?: string
  plinthMaxPx?: number
}
const props = withDefaults(defineProps<Props>(), {
  coverUrl: '',
  title: '',
  artist: '',
  year: '',
  isPlaying: false,
  progress: 0,
  trackCount: 0,
  currentTrackNumber: 0,
  plinthTexture: '/textures/wood-cedar.jpg',
});
const tonearmRestAngle = -100;
const outerRadius = 0.46;
const innerRadius = 0.22;
const TONEARM_AT_OUTER_DEG = -92;
const TONEARM_AT_INNER_DEG = -70;

const hasDisc = computed(() => {
  return props.trackCount > 0 || !!props.coverUrl;
});

function grooveRadiusFactorForPosition(t: number) {
  return outerRadius - t * (outerRadius - innerRadius);
}
const tonearmAngle = computed(() => {
  if (!hasDisc.value) return tonearmRestAngle;
  const tCount = Math.max(props.trackCount, 1);
  const p = Math.min(Math.max(props.progress, 0), 100) / 100;
  const tr = Math.max(props.currentTrackNumber, 1);
  let t = 0;
  if (tCount <= 1) {
    t = p;
  } else if (tr >= tCount) {
    t = 1;
  } else {
    t = (tr - 1) / (tCount - 1) + p * (1 / (tCount - 1));
  }
  return TONEARM_AT_OUTER_DEG + t * (TONEARM_AT_INNER_DEG - TONEARM_AT_OUTER_DEG);
});
const ringCount = computed(() => {
  const total = Math.max(0, props.trackCount);
  return Math.min(total, 24);
});
const activeRingIndex = computed(() => {
  const track = props.currentTrackNumber > 0 ? props.currentTrackNumber : 1;
  if (props.trackCount <= 1 || track <= 0) return 0;
  const normalized = (track - 1) / (props.trackCount - 1);
  return Math.round(normalized * (ringCount.value - 1));
});
const trackRings = computed(() => {
  const total = ringCount.value;
  if (total === 0) return [];
  return Array.from({ length: total }, (_, index) => {
    const t = total === 1 ? 0 : index / (total - 1);
    const radiusFactor = grooveRadiusFactorForPosition(t);
    const isActive = index === activeRingIndex.value;
    return { radiusFactor, isActive };
  });
});
const groovesPerTrack = 4;
const grooveRings = computed(() => {
  const total = ringCount.value;
  if (total === 0) {
    const defaultGrooves = 12;
    return Array.from({ length: defaultGrooves }, (_, index) => {
      const t = index / (defaultGrooves - 1);
      const radiusFactor = grooveRadiusFactorForPosition(t);
      return { radiusFactor, isTrackStart: false };
    });
  }
  const grooves: { radiusFactor: number, isTrackStart: boolean }[] = [];
  const totalGrooves = total * groovesPerTrack;
  for (let i = 0; i < totalGrooves; i++) {
    const t = i / (totalGrooves - 1);
    const radiusFactor = grooveRadiusFactorForPosition(t);
    const isTrackStart = i % groovesPerTrack === 0;
    grooves.push({ radiusFactor, isTrackStart });
  }
  return grooves;
});
const plinthStyle = computed(() => ({
  '--plinth-texture': `url('${props.plinthTexture}')`,
}));
const vinylStageStyle = computed(() => {
  if (props.plinthMaxPx != null && props.plinthMaxPx > 0) {
    return { '--plinth-max': `${Math.round(props.plinthMaxPx)}px` };
  }
  return {};
});
</script>

<template>
  <div class="vinyl-perspective">
    <div class="vinyl-stage" :style="vinylStageStyle">
      <div class="vinyl-plinth" :style="plinthStyle">
        <div class="vinyl-platter">
          <div class="vinyl-platter-ring" />
          <div class="vinyl-platter-spindle" />
          <div class="vinyl-disc-wrapper">
            <div v-if="hasDisc" class="vinyl-disc" :class="{ 'is-playing': isPlaying }">
              <div class="vinyl-grooves">
                <span
                  v-for="(groove, index) in grooveRings"
                  :key="`groove-${index}`"
                  class="vinyl-groove-ring"
                  :class="{ 'is-track-start': groove.isTrackStart }"
                  :style="{ '--groove-size-factor': groove.radiusFactor * 2 }"
                />
              </div>
              <div class="vinyl-tracks">
                <span
                  v-for="(ring, index) in trackRings"
                  :key="`track-${index}`"
                  class="vinyl-track-ring"
                  :class="{ 'is-active': ring.isActive }"
                  :style="{ '--ring-size-factor': ring.radiusFactor * 2 }"
                />
              </div>
              <div class="vinyl-label">
                <UiFadeImage
                  v-if="coverUrl"
                  :src="coverUrl"
                  :alt="title"
                  mode="img"
                  image-class="vinyl-label-image"
                  :duration="400"
                />
                <div v-else class="vinyl-label-text">
                  <div class="vinyl-label-upper">
                    <div v-if="artist" class="vinyl-label-artist">
                      {{ artist }}
                    </div>
                  </div>
                  <div class="vinyl-label-lower">
                    <div v-if="title" class="vinyl-label-album-year">
                      <span>{{ title }}</span>
                    </div>
                    <div v-if="year" class="vinyl-label-album-year">
                      <span>{{ year }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="hasDisc" class="vinyl-shine" />
          </div>
        </div>
        <div
          class="tonearm-unit"
          :style="{ '--tonearm-angle': `${tonearmAngle}deg` }"
        >
          <div class="tonearm-wobble" :class="{ 'is-playing': isPlaying }">
            <div class="tonearm-base" />
            <div class="tonearm-pivot" />
            <div class="tonearm-counterweight" />
            <div class="tonearm-fore-arm">
              <div class="tonearm-headshell">
                <div class="tonearm-cartridge" />
                <div class="tonearm-stylus" />
              </div>
              <div class="tonearm-arm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vinyl-perspective {
  perspective: 1000px;
  perspective-origin: 50% 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding-inline: clamp(6px, 1.8vw, 16px);
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  container-type: size;
  container-name: vinyl-player;
}
.vinyl-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  --plinth-max: 500px;
  --plinth-ideal-raw: max(220px, min(56vh, 68vmin));
  --plinth-ideal: min(var(--plinth-ideal-raw), var(--plinth-max));
  --plinth-size: min(var(--plinth-ideal), 100vmin);
  --plinth-tonearm-gutter: 20px;
  transform: rotateX(25deg);
  transform-style: preserve-3d;
  will-change: transform;
}
.vinyl-plinth {
  position: relative;
  --tonearm-scale: 1;
  --plinth-padding: clamp(12px, 2vw, 26px);
  width: min(var(--plinth-size), 100%);
  aspect-ratio: 1;
  height: auto;
  max-width: 100%;
  box-sizing: border-box;
  border-radius: clamp(8px, 1.2vw, 16px);
  background:
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.08) 0%,
      transparent 50%,
      rgba(0, 0, 0, 0.15) 100%
    ),
    var(--plinth-texture, url('/textures/wood-cedar.jpg'));
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--plinth-padding);
  overflow: visible;
  border: 1px solid rgba(120, 80, 40, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2),
    0 20px 40px -10px rgba(0, 0, 0, 0.4),
    0 30px 60px -20px rgba(0, 0, 0, 0.3);
  transform-style: preserve-3d;
}
.vinyl-platter {
  position: relative;
  width: 93%;
  aspect-ratio: 1;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.vinyl-platter-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    radial-gradient(circle at 30% 30%, rgba(200, 200, 205, 0.15) 0%, transparent 50%),
    linear-gradient(145deg,
      rgba(180, 180, 185, 0.98) 0%,
      rgba(140, 140, 145, 0.98) 25%,
      rgba(100, 100, 105, 0.98) 50%,
      rgba(130, 130, 135, 0.98) 75%,
      rgba(160, 160, 165, 0.98) 100%
    );
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.3),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    0 2px 8px rgba(0, 0, 0, 0.3);
}
.vinyl-platter-spindle {
  position: absolute;
  width: clamp(6px, 0.8vw, 10px);
  height: clamp(6px, 0.8vw, 10px);
  border-radius: 9999px;
  background:
    radial-gradient(circle at 35% 35%, rgba(180, 178, 175, 1) 0%, rgba(100, 98, 95, 1) 70%, rgba(40, 38, 35, 1) 100%);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.4);
  z-index: 5;
}
.vinyl-disc-wrapper {
  position: relative;
  width: 97%;
  height: 97%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
}
.vinyl-disc {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background:
    radial-gradient(circle at center, #1a1a1a 0%, #0d0d0d 8%, #151515 9%, #050505 100%);
  z-index: 1;
  animation: vinyl-spin 1.8s linear infinite;
  animation-play-state: paused;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
}
.vinyl-disc.is-playing {
  animation-play-state: running;
}
.vinyl-shine {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: conic-gradient(
    from 0deg at 50% 50%,
    transparent 0deg,
    rgba(255, 255, 255, 0.02) 30deg,
    rgba(255, 255, 255, 0.06) 60deg,
    rgba(255, 255, 255, 0.12) 90deg,
    rgba(255, 255, 255, 0.06) 120deg,
    rgba(255, 255, 255, 0.02) 150deg,
    transparent 180deg,
    rgba(255, 255, 255, 0.01) 210deg,
    rgba(255, 255, 255, 0.04) 250deg,
    rgba(255, 255, 255, 0.08) 270deg,
    rgba(255, 255, 255, 0.04) 290deg,
    rgba(255, 255, 255, 0.01) 330deg,
    transparent 360deg
  );
  pointer-events: none;
  z-index: 2;
  mask-image: radial-gradient(circle at center, transparent 16%, black 18%, black 100%);
}
.vinyl-grooves {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  pointer-events: none;
}
.vinyl-groove-ring {
  position: absolute;
  inset: 0;
  margin: auto;
  width: calc(100% * var(--groove-size-factor));
  height: calc(100% * var(--groove-size-factor));
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.025);
  opacity: 0.5;
}
.vinyl-groove-ring.is-track-start {
  border-color: rgba(255, 255, 255, 0.1);
  opacity: 0.8;
}
.vinyl-tracks {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  pointer-events: none;
}
.vinyl-track-ring {
  position: absolute;
  inset: 0;
  margin: auto;
  width: calc(100% * var(--ring-size-factor));
  height: calc(100% * var(--ring-size-factor));
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  opacity: 0.4;
  transition: opacity 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  will-change: opacity;
}
.vinyl-track-ring.is-active {
  border-color: var(--ui-color-primary-200);
  box-shadow:
    0 0 8px rgba(255, 255, 255, 0.4),
    0 0 16px rgba(255, 255, 255, 0.2),
    inset 0 0 4px rgba(255, 255, 255, 0.1);
  opacity: 1;
}
.vinyl-label {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 34%;
  height: 34%;
  border-radius: 9999px;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.98) 40%, rgba(240, 240, 240, 0.98) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.15);
}
.vinyl-label::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 6%;
  height: 6%;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(20, 20, 20, 0.6) 0%, rgba(40, 40, 40, 0.4) 100%);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
}
:deep(.vinyl-label-image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 9999px;
}
.vinyl-label-text {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0 25%, rgba(255, 255, 255, 0.0) 40% 100%),
    radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0 70%, rgba(220, 220, 220, 0.95) 71% 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  mask: radial-gradient(circle, transparent 0%, transparent 3%, black 3%, black 100%);
  -webkit-mask: radial-gradient(circle, transparent 0%, transparent 3%, black 3%, black 100%);
}
.vinyl-label-text::before {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 12%;
  height: 12%;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(30, 30, 30, 0.3) 0%, rgba(20, 20, 20, 0.2) 100%);
  box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.3);
  z-index: 2;
}
.vinyl-label-upper {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14% 8% 0;
  box-sizing: border-box;
  flex-shrink: 0;
}
.vinyl-label-lower {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-sizing: border-box;
  flex-shrink: 0;
  flex-grow: 1;
  padding: 14% 8% 1%;
}
.vinyl-label-artist {
  font-weight: 700;
  font-size: clamp(0.5em, 0.65em, 0.75em);
  line-height: 1.2;
  color: rgba(0, 0, 0, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  max-width: 90%;
  word-break: break-word;
  hyphens: auto;
}
.vinyl-label-album-year {
  font-weight: 600;
  font-size: clamp(0.4em, 0.5em, 0.6em);
  line-height: 1.2;
  color: rgba(0, 0, 0, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  max-width: 90%;
  word-break: break-word;
  hyphens: auto;
}
.tonearm-unit {
  position: absolute;
  top: clamp(20px, 3vw, 36px);
  right: clamp(20px, 3vw, 36px);
  width: clamp(160px, 22vw, 260px);
  height: clamp(40px, 5vw, 60px);
  --tonearm-arm-inset: clamp(12px, 1.8vw, 22px);
  transform-origin: 90% 50%;
  transform: rotate(var(--tonearm-angle, -35deg)) scale(var(--tonearm-scale, 1));
  transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
  pointer-events: none;
  will-change: transform;
  backface-visibility: hidden;
}
.tonearm-fore-arm {
  position: absolute;
  inset: 0;
  right: var(--tonearm-arm-inset);
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
  z-index: 1;
}
.tonearm-wobble {
  position: absolute;
  inset: 0;
}
.tonearm-wobble.is-playing {
  animation: tonearm-wobble 0.15s ease-in-out infinite;
}
.tonearm-base {
  position: absolute;
  top: 50%;
  right: 0;
  width: clamp(32px, 4vw, 48px);
  height: clamp(32px, 4vw, 48px);
  margin-top: clamp(-16px, -2vw, -24px);
  border-radius: 9999px;
  background:
    radial-gradient(circle at 40% 40%, rgba(70, 68, 65, 0.98), rgba(35, 33, 30, 0.99));
  box-shadow:
    0 4px 15px rgba(0, 0, 0, 0.5),
    inset 0 1px 2px rgba(255, 255, 255, 0.08),
    inset 0 -2px 6px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.04);
}
.tonearm-pivot {
  position: absolute;
  top: 50%;
  right: clamp(10px, 1.2vw, 14px);
  width: clamp(11px, 1.4vw, 17px);
  height: clamp(11px, 1.4vw, 17px);
  margin-top: clamp(-5.5px, -0.7vw, -8.5px);
  border-radius: 9999px;
  background:
    radial-gradient(circle at 35% 35%, rgba(160, 158, 155, 0.95), rgba(90, 88, 85, 0.95));
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
}
.tonearm-counterweight {
  position: absolute;
  top: 50%;
  right: clamp(36px, 4.5vw, 52px);
  width: clamp(16px, 2vw, 24px);
  height: clamp(16px, 2vw, 24px);
  margin-top: clamp(-8px, -1vw, -12px);
  border-radius: 9999px;
  background:
    linear-gradient(145deg, rgba(65, 62, 58, 0.98), rgba(40, 38, 35, 0.99));
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.5),
    inset 0 1px 2px rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.03);
}
.tonearm-arm {
  position: relative;
  flex: 1 1 auto;
  align-self: center;
  min-width: 1.5rem;
  height: clamp(4px, 0.5vw, 6px);
  margin-top: clamp(-2px, -0.25vw, -3px);
  background:
    linear-gradient(180deg,
      rgba(140, 138, 135, 0.95) 0%,
      rgba(100, 98, 95, 0.95) 30%,
      rgba(70, 68, 65, 0.95) 70%,
      rgba(55, 53, 50, 0.95) 100%
    );
  border-radius: 3px 0 0 3px;
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}
.tonearm-headshell {
  position: relative;
  flex-shrink: 0;
  width: clamp(19px, 2.4vw, 29px);
  height: clamp(11px, 1.4vw, 17px);
  margin-top: clamp(-5.5px, -0.7vw, -8.5px);
  background:
    linear-gradient(145deg, rgba(120, 118, 115, 0.95), rgba(70, 68, 65, 0.95));
  border-radius: 3px;
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.12);
  transform: rotate(22deg);
  transform-origin: right center;
}
.tonearm-cartridge {
  position: absolute;
  top: 50%;
  left: clamp(1.5px, 0.2vw, 2.5px);
  transform: translateY(-50%);
  width: clamp(6px, 0.8vw, 10px);
  height: clamp(5px, 0.6vw, 8px);
  background:
    linear-gradient(180deg, rgba(35, 33, 30, 0.98), rgba(20, 18, 15, 0.99));
  border-radius: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}
.tonearm-stylus {
  position: absolute;
  top: 50%;
  left: clamp(-2.5px, -0.3vw, -3.5px);
  transform: translateY(-50%);
  width: clamp(5px, 0.6vw, 8px);
  height: clamp(1.5px, 0.2vw, 2.5px);
  background: linear-gradient(90deg, rgba(200, 180, 160, 0.95), rgba(100, 95, 90, 1));
  border-radius: 1px;
}
.tonearm-stylus::after {
  content: '';
  position: absolute;
  top: 50%;
  left: clamp(-1.5px, -0.2vw, -2.5px);
  transform: translateY(-50%);
  width: clamp(2.5px, 0.3vw, 4px);
  height: clamp(2.5px, 0.3vw, 4px);
  background: radial-gradient(circle, rgba(220, 200, 180, 0.95), rgba(180, 160, 140, 0.95));
  border-radius: 50%;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.4),
    0 0 4px rgba(255, 255, 255, 0.1);
}
@keyframes tonearm-wobble {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(clamp(0.15px, 0.02vw, 0.25px));
  }
}
@keyframes vinyl-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@supports (width: 1cqmin) {
  .vinyl-stage {
    --plinth-size: min(
      var(--plinth-ideal),
      calc(100cqmin - var(--plinth-tonearm-gutter))
    );
  }
}
@supports (width: 1cqi) {
  .vinyl-plinth {
    container-type: inline-size;
    --plinth-padding: max(8px, min(3.4cqi, 24px));
    --tonearm-scale: min(1, calc(100cqi / 292px));
  }
  .vinyl-plinth .tonearm-unit {
    top: max(8px, min(6.8cqi, 34px));
    right: max(8px, min(6.8cqi, 34px));
    width: clamp(128px, min(74cqi, calc(100cqi - 16px)), 280px);
    height: clamp(26px, 10.5cqi, 60px);
    --tonearm-arm-inset: max(8px, min(4.2cqi, 20px));
  }
}
@media (prefers-reduced-motion: reduce) {
  .vinyl-disc {
    animation: none;
  }
  .tonearm-wobble.is-playing {
    animation: none;
  }
}
</style>
