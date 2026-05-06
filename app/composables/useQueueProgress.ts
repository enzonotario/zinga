import { computed } from 'vue';
import { formatTime } from '~/utils/time';

export default function useQueueProgress(mopidy: any) {
  const totalDuration = computed(() => {
    return (mopidy.tracklist.value || []).reduce((acc: number, tlTrack: any) => {
      return acc + (tlTrack.track?.length || 0);
    }, 0);
  });

  const currentProgress = computed(() => {
    if (!mopidy.tracklist.value || !mopidy.currentTrack.value) return 0;

    const currentIndex = mopidy.tracklist.value.findIndex(
      (t: any) => t.tlid === mopidy.currentTrack.value?.tlid,
    );

    if (currentIndex === -1) return 0;

    const previousTracksDuration = mopidy.tracklist.value
      .slice(0, currentIndex)
      .reduce((acc: number, tlTrack: any) => acc + (tlTrack.track?.length || 0), 0);

    return previousTracksDuration + (mopidy.currentState.value.time_position || 0);
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
