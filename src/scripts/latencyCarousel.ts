type CarouselRequest = {
  tick: number;
  action: string;
};

type CarouselVideo = {
  src: string;
  poster: string;
  label: string;
  requests: CarouselRequest[];
  stateFps: number;
  encodedFps: number;
};

type CarouselGroup = {
  id: string;
  comparison: string;
  mediaWidth: number;
  mediaHeight: number;
  requestDisplayFrames: number;
  actionKeys: Record<string, string[]>;
  videos: CarouselVideo[];
};

type CarouselDirection = 'next' | 'previous';

const initLatencyCarousel = () => {
  const root = document.querySelector<HTMLElement>('[data-latency-carousel]')!;

  const groups = JSON.parse(root.dataset.carouselData!) as CarouselGroup[];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-carousel-tab]')];
  const slides = [...root.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
  const videos = slides.map((slide) => slide.querySelector<HTMLVideoElement>('[data-carousel-video]')!);
  const media = slides.map((slide) => slide.querySelector<HTMLElement>('[data-carousel-media]')!);
  const actionKeys = slides.map((slide) => [
    ...slide.querySelectorAll<HTMLElement>('[data-action-key]'),
  ]);
  const stage = root.querySelector<HTMLElement>('.latency-carousel-stage')!;
  const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]')!;
  const track = root.querySelector<HTMLElement>('[data-carousel-track]')!;
  const previous = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')!;
  const current = root.querySelector<HTMLElement>('[data-carousel-current]')!;
  const context = root.querySelector<HTMLElement>('[data-carousel-context]')!;
  const animationDuration = 460;

  let activeIndex = -1;
  let activeGroupIndex = 0;
  let transitionLocked = false;
  let transitionTimer: number | null = null;
  let actionAnimationFrame: number | null = null;
  let geometryAnimationFrame: number | null = null;

  const setActionKeys = (slideIndex: number, active: Set<string>) => {
    actionKeys[slideIndex].forEach((key) => {
      key.classList.toggle('is-active', active.has(key.dataset.actionKey!));
    });
  };

  const clearActionKeys = () => {
    const idle = new Set<string>();
    slides.forEach((_, index) => setActionKeys(index, idle));
  };

  const updateActionKeys = (slideIndex: number) => {
    const group = groups[activeGroupIndex];
    const item = group.videos[slideIndex];
    const frame = Math.floor(videos[slideIndex].currentTime * item.encodedFps);
    const active = new Set<string>();

    for (const request of item.requests) {
      const startFrame = request.tick * item.encodedFps / item.stateFps;
      if (frame < startFrame || frame >= startFrame + group.requestDisplayFrames) continue;
      if (request.action !== 'NOOP') {
        group.actionKeys[request.action].forEach((key) => active.add(key));
      }
      break;
    }

    setActionKeys(slideIndex, active);
  };

  const stopActionSync = () => {
    if (actionAnimationFrame !== null) window.cancelAnimationFrame(actionAnimationFrame);
    actionAnimationFrame = null;
  };

  const startActionSync = (slideIndex: number) => {
    stopActionSync();
    const video = videos[slideIndex];
    const sync = () => {
      if (slideIndex !== activeIndex || video.paused) {
        actionAnimationFrame = null;
        return;
      }
      updateActionKeys(slideIndex);
      actionAnimationFrame = window.requestAnimationFrame(sync);
    };
    sync();
  };

  const playVideo = (video: HTMLVideoElement, slideIndex: number) => {
    void video.play().then(() => startActionSync(slideIndex)).catch((error: DOMException) => {
      if (error.name !== 'AbortError') throw error;
    });
  };

  const updateGeometry = () => {
    geometryAnimationFrame = null;
    const stageRect = stage.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const activeMedia = media[activeIndex];
    const activeSlide = slides[activeIndex];
    const trackStyles = window.getComputedStyle(track);
    const sideScale = Number.parseFloat(trackStyles.getPropertyValue('--latency-carousel-side-scale'));
    const sidePeek = Number.parseFloat(trackStyles.getPropertyValue('--latency-carousel-side-peek'));
    const sideOffset = (viewport.clientWidth + activeSlide.offsetWidth * sideScale) / 2 - sidePeek;
    const mediaLeft = viewportRect.left - stageRect.left + (viewport.clientWidth - activeMedia.offsetWidth) / 2;
    const mediaTop = viewportRect.top - stageRect.top + (track.offsetHeight - activeSlide.offsetHeight) / 2;

    track.style.setProperty('--latency-carousel-side-offset', `${sideOffset}px`);
    stage.style.setProperty(
      '--latency-carousel-arrow-y',
      `${mediaTop + activeMedia.offsetHeight / 2}px`,
    );
    stage.style.setProperty(
      '--latency-carousel-media-left',
      `${mediaLeft}px`,
    );
    stage.style.setProperty(
      '--latency-carousel-media-right',
      `${stageRect.width - mediaLeft - activeMedia.offsetWidth}px`,
    );
    viewport.style.height = `${track.offsetHeight}px`;
  };

  const scheduleGeometry = () => {
    if (geometryAnimationFrame !== null) window.cancelAnimationFrame(geometryAnimationFrame);
    geometryAnimationFrame = window.requestAnimationFrame(updateGeometry);
  };

  const positionFor = (index: number, centerIndex: number) => {
    if (index === centerIndex) return 'center';
    return index === (centerIndex + 1) % slides.length ? 'right' : 'left';
  };

  const wrapIndexFor = (centerIndex: number, direction: CarouselDirection | undefined) => {
    if (direction === 'next') return (centerIndex + 1) % slides.length;
    if (direction === 'previous') return (centerIndex + 2) % slides.length;
    return undefined;
  };

  const updateSlideState = (index: number, direction: CarouselDirection | undefined) => {
    const wrapIndex = wrapIndexFor(index, direction);
    const moveSlideFocus = slides.includes(document.activeElement as HTMLElement);
    activeIndex = index;
    stopActionSync();
    clearActionKeys();

    slides.forEach((slide, slideIndex) => {
      const isCenter = slideIndex === activeIndex;
      const position = positionFor(slideIndex, activeIndex);
      const video = videos[slideIndex];

      slide.dataset.carouselPosition = position;
      slide.classList.toggle('is-active', isCenter);
      slide.setAttribute('aria-hidden', String(!isCenter));
      slide.tabIndex = isCenter ? 0 : -1;
      slide.removeAttribute('data-carousel-wrap');
      if (slideIndex === wrapIndex) slide.dataset.carouselWrap = direction!;

      if (isCenter) {
        video.autoplay = true;
        video.preload = 'metadata';
        video.pause();
        video.load();
        playVideo(video, slideIndex);
      } else {
        video.pause();
        video.removeAttribute('autoplay');
        video.preload = 'none';
        if (document.activeElement === slide) slide.blur();
      }
    });

    current.textContent = String(activeIndex + 1).padStart(2, '0');
    if (moveSlideFocus) slides[activeIndex].focus();
    scheduleGeometry();
  };

  const selectSlide = (targetIndex: number) => {
    const index = (targetIndex + slides.length) % slides.length;
    if (index === activeIndex || transitionLocked) return;

    const distance = (index - activeIndex + slides.length) % slides.length;
    const direction: CarouselDirection = distance === 1 ? 'next' : 'previous';
    transitionLocked = true;
    updateSlideState(index, direction);
    transitionTimer = window.setTimeout(() => {
      slides.forEach((slide) => slide.removeAttribute('data-carousel-wrap'));
      transitionLocked = false;
      transitionTimer = null;
    }, animationDuration);
  };

  const clearVideo = (video: HTMLVideoElement) => {
    video.pause();
    video.removeAttribute('autoplay');
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
  };

  const loadGroup = (groupIndex: number) => {
    const group = groups[groupIndex];
    activeGroupIndex = groupIndex;
    activeIndex = -1;
    transitionLocked = false;
    stopActionSync();
    clearActionKeys();
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = null;
    viewport.style.height = `${viewport.offsetHeight}px`;
    root.dataset.carouselEnvironment = group.id;

    tabs.forEach((tab, index) => {
      const isSelected = index === activeGroupIndex;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });

    context.textContent = group.comparison;
    viewport.setAttribute('aria-labelledby', tabs[groupIndex].id);

    slides.forEach((slide, index) => {
      const item = group.videos[index];
      const video = videos[index];
      clearVideo(video);
      video.src = item.src;
      video.poster = item.poster;
      video.width = group.mediaWidth;
      video.height = group.mediaHeight;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = index === 1 ? 'metadata' : 'none';
      video.setAttribute('aria-label', item.label);
      slide.setAttribute('aria-label', item.label);
    });

    updateSlideState(1, undefined);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (index !== activeGroupIndex) loadGroup(index);
    });
    tab.addEventListener('keydown', (event) => {
      let targetIndex = index;
      if (event.key === 'ArrowLeft') targetIndex = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = tabs.length - 1;
      if (targetIndex === index) return;
      event.preventDefault();
      loadGroup(targetIndex);
      tabs[targetIndex].focus();
    });
  });

  previous.addEventListener('click', () => selectSlide(activeIndex - 1));
  next.addEventListener('click', () => selectSlide(activeIndex + 1));

  viewport.addEventListener('keydown', (event) => {
    let targetIndex: number | undefined;
    if (event.key === 'ArrowLeft') targetIndex = activeIndex - 1;
    if (event.key === 'ArrowRight') targetIndex = activeIndex + 1;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = slides.length - 1;
    if (targetIndex === undefined) return;
    event.preventDefault();
    selectSlide(targetIndex);
  });

  let pointerId = -1;
  let pointerStartX = 0;

  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    track.classList.add('is-dragging');
    track.setPointerCapture(pointerId);
  });

  track.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    if (Math.abs(event.clientX - pointerStartX) > 4) event.preventDefault();
  });

  const releasePointer = (event: PointerEvent) => {
    pointerId = -1;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
  };

  const finishPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const distance = event.clientX - pointerStartX;
    releasePointer(event);
    if (Math.abs(distance) < 40) return;
    selectSlide(distance < 0 ? activeIndex + 1 : activeIndex - 1);
  };

  const cancelPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    releasePointer(event);
  };

  track.addEventListener('pointerup', finishPointer);
  track.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('resize', scheduleGeometry);

  loadGroup(0);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLatencyCarousel, { once: true });
} else {
  initLatencyCarousel();
}
