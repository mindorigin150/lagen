type CarouselVideo = {
  src: string;
  poster: string;
  label: string;
};

type CarouselGroup = {
  title: string;
  comparison: string;
  videos: CarouselVideo[];
};

const initLatencyCarousel = () => {
  const root = document.querySelector<HTMLElement>('[data-latency-carousel]')!;

  const groups = JSON.parse(root.dataset.carouselData!) as CarouselGroup[];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-carousel-tab]')];
  const slides = [...root.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
  const videos = slides.map((slide) => slide.querySelector<HTMLVideoElement>('[data-carousel-video]')!);
  const track = root.querySelector<HTMLElement>('[data-carousel-track]')!;
  const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]')!;
  const previous = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')!;
  const current = root.querySelector<HTMLElement>('[data-carousel-current]')!;
  const context = root.querySelector<HTMLElement>('[data-carousel-context]')!;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let activeIndex = -1;
  let activeGroupIndex = 0;
  let scrollFrame: number | null = null;

  const reducedMotion = () => motionQuery.matches;
  const playVideo = (video: HTMLVideoElement) => {
    void video.play().catch((error: DOMException) => {
      if (error.name !== 'AbortError') throw error;
    });
  };

  const updateControls = () => {
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === slides.length - 1;
    current.textContent = String(activeIndex + 1).padStart(2, '0');
  };

  const nearestSlide = () => {
    const trackBounds = track.getBoundingClientRect();
    const trackCenter = trackBounds.left + track.clientWidth / 2;
    return slides.reduce((nearest, slide, index) => {
      const bounds = slide.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - trackCenter);
      return distance < nearest.distance ? { index, distance } : nearest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
  };

  const scrollToSlide = (index: number, animate = true) => {
    const slide = slides[index];
    const left = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
    track.scrollTo({ left, behavior: animate && !reducedMotion() ? 'smooth' : 'auto' });
  };

  const updateSlideState = (index: number, shouldScroll: boolean) => {
    if (index === activeIndex) {
      if (shouldScroll) scrollToSlide(index);
      return;
    }

    activeIndex = index;
    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === activeIndex;
      slide.setAttribute('aria-hidden', String(!isActive));
      slide.tabIndex = isActive ? 0 : -1;
      slide.classList.toggle('is-active', isActive);

      const video = videos[slideIndex];
      if (isActive) {
        const shouldPlay = !reducedMotion();
        video.autoplay = shouldPlay;
        video.preload = 'metadata';
        video.load();
        if (shouldPlay) playVideo(video);
      } else {
        video.pause();
        if (document.activeElement === slide) slide.blur();
        video.removeAttribute('autoplay');
      }
    });

    updateControls();
    if (shouldScroll) scrollToSlide(index);
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
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = index === 0 ? 'metadata' : 'none';
      video.setAttribute('aria-label', item.label);
      slide.setAttribute('aria-label', `${group.title} comparison ${index + 1} of ${slides.length}`);
    });

    scrollToSlide(0, false);
    updateSlideState(0, false);
  };

  const selectSlide = (index: number) => {
    updateSlideState(index, true);
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
    if (event.key === 'ArrowLeft' && activeIndex > 0) targetIndex = activeIndex - 1;
    if (event.key === 'ArrowRight' && activeIndex < slides.length - 1) targetIndex = activeIndex + 1;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = slides.length - 1;
    if (targetIndex === undefined) return;
    event.preventDefault();
    selectSlide(targetIndex);
  });

  track.addEventListener('scroll', () => {
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      updateSlideState(nearestSlide(), false);
    });
  }, { passive: true });

  let pointerId = -1;
  let pointerStartX = 0;
  let pointerStartScroll = 0;

  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartScroll = track.scrollLeft;
    track.style.scrollBehavior = 'auto';
    track.classList.add('is-dragging');
    track.setPointerCapture(pointerId);
  });

  track.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const distance = event.clientX - pointerStartX;
    if (Math.abs(distance) > 4) event.preventDefault();
    track.scrollLeft = pointerStartScroll - distance;
  });

  const finishPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = -1;
    track.classList.remove('is-dragging');
    track.style.scrollBehavior = '';
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    selectSlide(nearestSlide());
  };

  track.addEventListener('pointerup', finishPointer);
  track.addEventListener('pointercancel', finishPointer);

  const handleMotionChange = () => {
    const video = videos[activeIndex];
    if (reducedMotion()) {
      video.pause();
      video.removeAttribute('autoplay');
      return;
    }
    video.autoplay = true;
    video.load();
    playVideo(video);
  };

  motionQuery.addEventListener('change', handleMotionChange);
  window.addEventListener('resize', () => scrollToSlide(activeIndex, false));
  loadGroup(0);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLatencyCarousel, { once: true });
} else {
  initLatencyCarousel();
}
