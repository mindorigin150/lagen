type CarouselRequest = {
  tick: number;
  action: string;
};

type CarouselVariant = {
  video: string;
  rightDeathEncodedFrame: number | null;
};

type CarouselVideo = {
  label: string;
  poster: string;
  requests: CarouselRequest[];
  envFps: number;
  stateFps: number;
  encodedFps: number;
  variants: CarouselVariant[];
};

type CarouselGroup = {
  id: 'flappy' | 'demon_attack' | 'deadly_corridor';
  title: string;
  mediaWidth: number;
  mediaHeight: number;
  defaultLatency: number;
  maxLatency: number;
  videos: CarouselVideo[];
};

type CarouselDirection = 'next' | 'previous';

type DeathState = {
  lastTime: number;
  snapshot: boolean;
};

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
  const canvases = slides.map((slide) => slide.querySelector<HTMLCanvasElement>('[data-death-canvas]')!);
  const deathXs = slides.map((slide) => slide.querySelector<HTMLElement>('[data-death-x]')!);
  const stage = root.querySelector<HTMLElement>('.latency-carousel-stage')!;
  const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]')!;
  const track = root.querySelector<HTMLElement>('[data-carousel-track]')!;
  const previous = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')!;
  const current = root.querySelector<HTMLElement>('[data-carousel-current]')!;
  const context = root.querySelector<HTMLElement>('[data-carousel-context]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-latency-slider]')!;
  const latencyFrames = root.querySelector<HTMLElement>('[data-latency-frames]')!;
  const latencyMs = root.querySelector<HTMLElement>('[data-latency-ms]')!;
  const animationDuration = 460;

  let activeIndex = -1;
  let activeGroupIndex = 0;
  let transitionLocked = false;
  let transitionTimer: number | null = null;
  let actionAnimationFrame: number | null = null;
  let deathAnimationFrame: number | null = null;
  let geometryAnimationFrame: number | null = null;
  let mediaGeneration = 0;
  const selectedLatency = groups.map((group) => group.defaultLatency);
  const deathStates: DeathState[] = slides.map(() => ({
    lastTime: 0,
    snapshot: false,
  }));

  const group = () => groups[activeGroupIndex];
  const item = (slideIndex: number) => group().videos[slideIndex];
  const latency = () => selectedLatency[activeGroupIndex];
  const variantFor = (slideIndex: number, rawFrames = latency()) => item(slideIndex).variants[rawFrames];

  const setActionKeys = (slideIndex: number, active: Set<string>) => {
    actionKeys[slideIndex].forEach((key) => {
      key.classList.toggle('is-active', active.has(key.dataset.actionKey!));
    });
  };

  const clearActionKeys = () => {
    const idle = new Set<string>();
    slides.forEach((_, index) => setActionKeys(index, idle));
  };

  const actionAliases: Record<string, string[]> = {
    NOOP: [],
    noop: [],
    flap: ['flap'],
    LEFT: ['move-left'],
    RIGHT: ['move-right'],
    FIRE: ['fire'],
    LEFTFIRE: ['move-left', 'fire'],
    RIGHTFIRE: ['move-right', 'fire'],
    MOVE_LEFT: ['move-left'],
    MOVE_RIGHT: ['move-right'],
    MOVE_FORWARD: ['move-forward'],
    TURN_LEFT: ['turn-left'],
    TURN_RIGHT: ['turn-right'],
    ATTACK: ['fire'],
  };

  const actionKeysFor = (action: string) => {
    const keys: string[] = [];
    action.split('+').forEach((part) => keys.push(...actionAliases[part]));
    return keys;
  };

  const updateActionKeys = (slideIndex: number) => {
    const currentItem = item(slideIndex);
    const rawFrame = Math.floor(videos[slideIndex].currentTime * currentItem.stateFps);
    const request = currentItem.requests.reduce<CarouselRequest | undefined>((latest, candidate) => {
      return candidate.tick <= rawFrame ? candidate : latest;
    }, undefined);
    const active = new Set<string>();
    if (request) actionKeysFor(request.action).forEach((key) => active.add(key));
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

  const clearDeathCanvas = (slideIndex: number) => {
    const canvas = canvases[slideIndex];
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.remove('is-visible');
    deathXs[slideIndex].classList.remove('is-visible');
    deathXs[slideIndex].style.opacity = '0';
  };

  const resetDeath = (slideIndex: number) => {
    const state = deathStates[slideIndex];
    state.lastTime = 0;
    state.snapshot = false;
    clearDeathCanvas(slideIndex);
  };

  const captureRightHalf = (slideIndex: number) => {
    const video = videos[slideIndex];
    const canvas = canvases[slideIndex];
    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const context2d = canvas.getContext('2d')!;
    context2d.clearRect(0, 0, width, height);
    context2d.save();
    context2d.filter = 'grayscale(1)';
    context2d.drawImage(video, width / 2, 0, width / 2, height, width / 2, 0, width / 2, height);
    context2d.restore();
  };

  const updateDeath = (slideIndex: number) => {
    const video = videos[slideIndex];
    const state = deathStates[slideIndex];
    const selectedVariant = variantFor(slideIndex);
    const deathFrame = selectedVariant.rightDeathEncodedFrame;
    if (deathFrame === null) {
      if (state.snapshot) resetDeath(slideIndex);
      return;
    }

    const deathTime = deathFrame / item(slideIndex).encodedFps;
    const currentTime = video.currentTime;
    if (currentTime < state.lastTime || currentTime < deathTime) {
      if (state.snapshot) resetDeath(slideIndex);
      state.lastTime = currentTime;
      return;
    }

    if (!state.snapshot) {
      captureRightHalf(slideIndex);
      state.snapshot = true;
      canvases[slideIndex].classList.add('is-visible');
    }

    const age = currentTime - deathTime;
    deathXs[slideIndex].classList.add('is-visible');
    deathXs[slideIndex].style.opacity = String(age <= 2 ? 1 : Math.max(0, 1 - (age - 2) / 0.35));
    state.lastTime = currentTime;
  };

  const stopDeathSync = () => {
    if (deathAnimationFrame !== null) window.cancelAnimationFrame(deathAnimationFrame);
    deathAnimationFrame = null;
  };

  const startDeathSync = (slideIndex: number) => {
    stopDeathSync();
    const sync = () => {
      if (slideIndex !== activeIndex) {
        deathAnimationFrame = null;
        return;
      }
      updateDeath(slideIndex);
      deathAnimationFrame = window.requestAnimationFrame(sync);
    };
    sync();
  };

  const playVideo = (video: HTMLVideoElement, slideIndex: number, generation: number) => {
    void video.play().then(() => {
      if (generation !== mediaGeneration || slideIndex !== activeIndex) return;
      startActionSync(slideIndex);
      startDeathSync(slideIndex);
    }).catch((error: DOMException) => {
      if (error.name !== 'AbortError') throw error;
    });
  };

  const updateLatencyLabels = () => {
    const selectedItem = item(activeIndex);
    const rawFrames = latency();
    const milliseconds = Math.round(rawFrames / selectedItem.envFps * 1000);
    latencyFrames.textContent = `${rawFrames} raw frames`;
    latencyMs.textContent = `${milliseconds} ms`;
    slider.max = String(group().maxLatency);
    slider.value = String(rawFrames);
    slider.setAttribute('aria-label', `Right-side inference latency for ${group().title}`);
    context.textContent = `Left: No Latency · Right: ${rawFrames} raw frames (${milliseconds} ms)`;
  };

  const updateSlideLabels = () => {
    slides.forEach((slide, slideIndex) => {
      const label = `${item(slideIndex).label}: ${latency()} raw frames right-side latency`;
      slide.setAttribute('aria-label', label);
      videos[slideIndex].setAttribute('aria-label', label);
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
    stage.style.setProperty('--latency-carousel-arrow-y', `${mediaTop + activeMedia.offsetHeight / 2}px`);
    stage.style.setProperty('--latency-carousel-media-left', `${mediaLeft}px`);
    stage.style.setProperty('--latency-carousel-media-right', `${stageRect.width - mediaLeft - activeMedia.offsetWidth}px`);
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

  const prepareVariant = (slideIndex: number) => {
    const selectedVariant = variantFor(slideIndex);
    const video = videos[slideIndex];
    video.src = selectedVariant.video;
    video.poster = item(slideIndex).poster;
  };

  const loadVariant = (slideIndex: number, preservedTime: number, shouldPlay: boolean) => {
    const video = videos[slideIndex];
    const source = variantFor(slideIndex);
    const generation = ++mediaGeneration;
    stopActionSync();
    stopDeathSync();
    resetDeath(slideIndex);
    video.pause();
    video.src = source.video;
    video.poster = item(slideIndex).poster;
    video.load();
    const onMetadata = () => {
      if (generation !== mediaGeneration || slideIndex !== activeIndex) return;
      let seeked = preservedTime === 0;
      let canPlay = video.readyState >= 3;
      const resume = () => {
        if (!seeked || !canPlay || generation !== mediaGeneration || slideIndex !== activeIndex) return;
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('canplay', onCanPlay);
        playVideo(video, slideIndex, generation);
      };
      const onSeeked = () => {
        seeked = true;
        resume();
      };
      const onCanPlay = () => {
        canPlay = true;
        resume();
      };
      if (shouldPlay) {
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('canplay', onCanPlay, { once: true });
      }
      video.currentTime = preservedTime;
      if (shouldPlay) resume();
    };
    video.addEventListener('loadedmetadata', onMetadata, { once: true });
  };

  const updateSlideState = (index: number, direction: CarouselDirection | undefined) => {
    const wrapIndex = wrapIndexFor(index, direction);
    const moveSlideFocus = slides.includes(document.activeElement as HTMLElement);
    activeIndex = index;
    stopActionSync();
    stopDeathSync();
    clearActionKeys();
    slides.forEach((slide, slideIndex) => {
      const isCenter = slideIndex === activeIndex;
      const video = videos[slideIndex];
      slide.dataset.carouselPosition = positionFor(slideIndex, activeIndex);
      slide.classList.toggle('is-active', isCenter);
      slide.setAttribute('aria-hidden', String(!isCenter));
      slide.tabIndex = isCenter ? 0 : -1;
      slide.removeAttribute('data-carousel-wrap');
      if (slideIndex === wrapIndex) slide.dataset.carouselWrap = direction!;
      resetDeath(slideIndex);
      if (isCenter) {
        video.autoplay = true;
        video.preload = 'metadata';
        loadVariant(slideIndex, 0, true);
      } else {
        prepareVariant(slideIndex);
        video.pause();
        video.removeAttribute('autoplay');
        video.preload = 'none';
        if (document.activeElement === slide) slide.blur();
      }
    });

    current.textContent = String(activeIndex + 1).padStart(2, '0');
    updateLatencyLabels();
    updateSlideLabels();
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
    const nextGroup = groups[groupIndex];
    ++mediaGeneration;
    activeGroupIndex = groupIndex;
    activeIndex = -1;
    transitionLocked = false;
    stopActionSync();
    stopDeathSync();
    clearActionKeys();
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = null;
    viewport.style.height = `${viewport.offsetHeight}px`;
    root.dataset.carouselEnvironment = nextGroup.id;

    tabs.forEach((tab, index) => {
      const isSelected = index === activeGroupIndex;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });

    viewport.setAttribute('aria-labelledby', tabs[groupIndex].id);
    slides.forEach((slide, index) => {
      const nextItem = nextGroup.videos[index];
      const video = videos[index];
      resetDeath(index);
      clearVideo(video);
      video.width = nextGroup.mediaWidth;
      video.height = nextGroup.mediaHeight;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = index === 1 ? 'metadata' : 'none';
      slide.setAttribute('aria-label', nextItem.label);
    });

    updateSlideState(1, undefined);
  };

  slider.addEventListener('input', () => {
    const rawFrames = Number(slider.value);
    selectedLatency[activeGroupIndex] = rawFrames;
    const preservedTime = activeIndex >= 0 ? videos[activeIndex].currentTime : 0;
    const wasPlaying = activeIndex >= 0 && !videos[activeIndex].paused;
    slides.forEach((_, slideIndex) => {
      resetDeath(slideIndex);
      if (slideIndex !== activeIndex) prepareVariant(slideIndex);
    });
    updateLatencyLabels();
    updateSlideLabels();
    if (activeIndex >= 0) loadVariant(activeIndex, preservedTime, wasPlaying);
  });

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
