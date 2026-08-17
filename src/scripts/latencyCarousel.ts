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

type CarouselDirection = 'next' | 'previous';

const initLatencyCarousel = () => {
  const root = document.querySelector<HTMLElement>('[data-latency-carousel]')!;

  const groups = JSON.parse(root.dataset.carouselData!) as CarouselGroup[];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-carousel-tab]')];
  const slides = [...root.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
  const videos = slides.map((slide) => slide.querySelector<HTMLVideoElement>('[data-carousel-video]')!);
  const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]')!;
  const track = root.querySelector<HTMLElement>('[data-carousel-track]')!;
  const previous = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')!;
  const current = root.querySelector<HTMLElement>('[data-carousel-current]')!;
  const context = root.querySelector<HTMLElement>('[data-carousel-context]')!;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animationDuration = 460;

  let activeIndex = -1;
  let activeGroupIndex = 0;
  let transitionLocked = false;
  let transitionTimer: number | null = null;

  const reducedMotion = () => motionQuery.matches;

  const playVideo = (video: HTMLVideoElement) => {
    void video.play().catch((error: DOMException) => {
      if (error.name !== 'AbortError') throw error;
    });
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

  const updateSlideState = (index: number, direction: CarouselDirection | undefined, animate: boolean) => {
    const wrapIndex = wrapIndexFor(index, direction);
    const moveSlideFocus = slides.includes(document.activeElement as HTMLElement);
    activeIndex = index;

    slides.forEach((slide, slideIndex) => {
      const isCenter = slideIndex === activeIndex;
      const position = positionFor(slideIndex, activeIndex);
      const video = videos[slideIndex];

      slide.dataset.carouselPosition = position;
      slide.classList.toggle('is-active', isCenter);
      slide.setAttribute('aria-hidden', String(!isCenter));
      slide.tabIndex = isCenter ? 0 : -1;
      slide.removeAttribute('data-carousel-wrap');
      if (animate && slideIndex === wrapIndex) slide.dataset.carouselWrap = direction!;

      if (isCenter) {
        video.autoplay = true;
        video.preload = 'metadata';
        video.pause();
        video.load();
        playVideo(video);
      } else {
        video.pause();
        video.removeAttribute('autoplay');
        video.preload = 'none';
        if (document.activeElement === slide) slide.blur();
      }
    });

    current.textContent = String(activeIndex + 1).padStart(2, '0');
    if (moveSlideFocus) slides[activeIndex].focus();
  };

  const selectSlide = (targetIndex: number) => {
    const index = (targetIndex + slides.length) % slides.length;
    if (index === activeIndex || transitionLocked) return;

    const distance = (index - activeIndex + slides.length) % slides.length;
    const direction: CarouselDirection = distance === 1 ? 'next' : 'previous';
    const animate = !reducedMotion();

    transitionLocked = animate;
    updateSlideState(index, direction, animate);
    if (animate) {
      transitionTimer = window.setTimeout(() => {
        slides.forEach((slide) => slide.removeAttribute('data-carousel-wrap'));
        transitionLocked = false;
        transitionTimer = null;
      }, animationDuration);
    }
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
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = null;

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
      video.preload = index === 1 ? 'metadata' : 'none';
      video.setAttribute('aria-label', item.label);
      slide.setAttribute('aria-label', `${group.title} comparison ${index + 1} of ${slides.length}`);
    });

    updateSlideState(1, undefined, false);
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

  loadGroup(0);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLatencyCarousel, { once: true });
} else {
  initLatencyCarousel();
}
