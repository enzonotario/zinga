import { computed } from 'vue';
import { formatTime } from '~/utils/time';
import usePlayer from './usePlayer';
import usePlayQueue from './usePlayQueue';

export default function useQueueProgress() {
  const queue = usePlayQueue();
  const player = usePlayer();

  const totalDuration = computed(() => {
    return queue.items.value.reduce((acc, item) => acc + (item.track.length || 0), 0);
  });

  const currentProgress = computed(() => {
    const currentTlid = player.currentItem.value?.tlid;
    const currentIndex = queue.items.value.findIndex((item) => item.tlid === currentTlid);
    if (currentIndex === -1) return 0;

    const previousTracksDuration = queue.items.value
      .slice(0, currentIndex)
      .reduce((acc, item) => acc + (item.track.length || 0), 0);

    return previousTracksDuration + player.position.value * 1000;
  });

  const progressPercentage = computed(() => {
    if (totalDuration.value === 0) return 0;
    return (currentProgress.value / totalDuration.value) * 100;
  });

  const formattedCurrentProgress = computed(() => formatTime(currentProgress.value / 1000));
  const formattedTotalDuration = computed(() => formatTime(totalDuration.value / 1000));
  const formattedRemainingDuration = computed(() => {
    const remaining = totalDuration.value - currentProgress.value;
    return formatTime(Math.max(0, remaining) / 1000);
  });

  return {
    totalDuration,
    currentProgress,
    progressPercentage,
    formattedCurrentProgress,
    formattedTotalDuration,
    formattedRemainingDuration,
  };
}
