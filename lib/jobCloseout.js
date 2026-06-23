export const CLOSEOUT_MIN_PHOTOS = 3;
export const CLOSEOUT_MIN_WALKTHROUGH_VIDEOS = 1;

export function closeoutChecklistFromMedia(media) {
  const rows = Array.isArray(media) ? media : [];
  const normalized = rows.map((item) => {
    const mediaType = item.media_type || (String(item.mime_type || '').startsWith('video/') ? 'video' : 'photo');
    return { ...item, mediaType };
  });
  const photoCount = normalized.filter((item) => item.mediaType === 'photo').length;
  const walkthroughCount = normalized.filter((item) => item.mediaType === 'video' && item.kind === 'walkthrough').length;
  const missingPhotos = Math.max(0, CLOSEOUT_MIN_PHOTOS - photoCount);
  const missingWalkthroughVideos = Math.max(0, CLOSEOUT_MIN_WALKTHROUGH_VIDEOS - walkthroughCount);

  return {
    photoCount,
    walkthroughCount,
    missingPhotos,
    missingWalkthroughVideos,
    complete: missingPhotos === 0 && missingWalkthroughVideos === 0,
  };
}

export function closeoutGateMessage(checklist) {
  const parts = [];
  if (checklist.missingPhotos > 0) {
    parts.push(`${checklist.missingPhotos} more photo${checklist.missingPhotos === 1 ? '' : 's'}`);
  }
  if (checklist.missingWalkthroughVideos > 0) {
    parts.push('1 walkthrough video');
  }
  if (!parts.length) return '';
  return `Closeout blocked: add ${parts.join(' and ')} before marking this job complete.`;
}

export async function loadCloseoutChecklist(sb, jobId) {
  const { data, error } = await sb
    .from('job_photos')
    .select('id, media_type, mime_type, kind')
    .eq('job_id', jobId)
    .is('deleted_at', null);
  if (error) return { checklist: null, error };
  return { checklist: closeoutChecklistFromMedia(data), error: null };
}
