import { Tooltip } from "https://cdn.jsdelivr.net/npm/bootstrap@5.3.5/+esm";
import imageCompareViewer from "https://cdn.jsdelivr.net/npm/image-compare-viewer@1.6.2/+esm";
import signaturePad from "https://cdn.jsdelivr.net/npm/signature_pad@5.0.7/+esm";

function loadConfig() {
  if (localStorage.getItem("darkMode") == 1) {
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function toggleDarkMode() {
  if (localStorage.getItem("darkMode") == 1) {
    localStorage.setItem("darkMode", 0);
    document.documentElement.setAttribute("data-bs-theme", "light");
  } else {
    localStorage.setItem("darkMode", 1);
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function initLangSelect() {
  const langSelect = document.getElementById("lang");
  langSelect.onchange = () => {
    const lang = langSelect.options[langSelect.selectedIndex].value;
    location.href = `/cv-masker/${lang}/`;
  };
}

function initTooltip() {
  for (const node of document.querySelectorAll('[data-bs-toggle="tooltip"]')) {
    const tooltip = new Tooltip(node);
    node.addEventListener("touchstart", () => tooltip.show());
    node.addEventListener("touchend", () => tooltip.hide());
    node.addEventListener("click", () => {
      if (!tooltip.tip) return;
      tooltip.tip.classList.add("d-none");
      tooltip.hide();
      tooltip.tip.classList.remove("d-none");
    });
  }
}

async function getOpenCVPath() {
  const simdSupport = await wasmFeatureDetect.simd();
  const threadsSupport = self.crossOriginIsolated &&
    await wasmFeatureDetect.threads();
  if (simdSupport && threadsSupport) {
    return "/cv-masker/opencv/threaded-simd/opencv_js.js";
  } else if (simdSupport) {
    return "/cv-masker/opencv/simd/opencv_js.js";
  } else if (threadsSupport) {
    return "/cv-masker/opencv/threads/opencv_js.js";
  } else {
    return "/cv-masker/opencv/wasm/opencv_js.js";
  }
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    script.src = url;
    document.body.appendChild(script);
  });
}

function getTransparentBackgroundImage(size, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = colors[0];
  context.fillRect(0, 0, size / 2, size / 2);
  context.fillRect(size / 2, size / 2, size / 2, size / 2);
  context.fillStyle = colors[1];
  context.fillRect(size / 2, 0, size / 2, size / 2);
  context.fillRect(0, size / 2, size / 2, size / 2);
  const url = canvas.toDataURL("image/png");
  return `url(${url})`;
}

function setTransparentCSSVariables() {
  const lightBg = getTransparentBackgroundImage(32, ["#ddd", "#fff"]);
  const darkBg = getTransparentBackgroundImage(32, ["#333", "#212529"]);
  document.documentElement.style.setProperty(
    "--transparent-bg-light",
    lightBg,
  );
  document.documentElement.style.setProperty(
    "--transparent-bg-dark",
    darkBg,
  );
}

async function toBlob(canvas, type, quality) {
  return await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

class Panel {
  constructor(panel) {
    this.panel = panel;
  }

  show() {
    this.panel.classList.remove("d-none");
  }

  hide() {
    this.panel.classList.add("d-none");
  }

  getActualRect(canvas) {
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const naturalWidth = canvas.width;
    const naturalHeight = canvas.height;
    const aspectRatio = naturalWidth / naturalHeight;
    let width, height, top, left, right, bottom;
    if (canvasWidth / canvasHeight > aspectRatio) {
      width = canvasHeight * aspectRatio;
      height = canvasHeight;
      top = 0;
      left = (canvasWidth - width) / 2;
      right = left + width;
      bottom = canvasHeight;
    } else {
      width = canvasWidth;
      height = canvasWidth / aspectRatio;
      top = (canvasHeight - height) / 2;
      left = 0;
      right = canvasWidth;
      bottom = top + height;
    }
    return { width, height, top, left, right, bottom };
  }
}

class LoadPanel extends Panel {
  constructor(panel) {
    super(panel);

    for (const node of document.querySelectorAll(".image-compare")) {
      const images = node.querySelectorAll("img");
      images[0].classList.remove("w-100");
      new imageCompareViewer(node, { addCircle: true }).mount();
      images[1].classList.remove("d-none");
    }
    panel.querySelector(".selectImage").onclick = () => {
      panel.querySelector(".inputImage").click();
    };
    panel.querySelector(".inputImage").onchange = (event) => {
      this.loadInputImage(event);
    };
    const examples = panel.querySelector(".examples");
    if (examples) {
      for (const img of examples.querySelectorAll("img")) {
        img.onclick = () => {
          const url = img.src.replace("-64", "");
          this.loadImage(url);
        };
      }
    }
  }

  show() {
    super.show();
    document.body.scrollIntoView({ behavior: "instant" });
  }

  executeCamera() {
    this.hide();
    cameraPanel.show();
    cameraPanel.executeVideo();
  }

  handleImageOnloadEvent = (event) => {
    const img = event.currentTarget;
    filterPanel.setCanvas(img);
    if (filterPanel.mask) filterPanel.mask.delete();
    filterPanel.mask = new cv.Mat.zeros(
      img.naturalHeight,
      img.naturalWidth,
      cv.CV_8UC1,
    );
    filterPanel.drawCircle(
      filterPanel.paintCanvas,
      filterPanel.paintCanvasContext,
    );
    filterPanel.updateMask();
    const filter = filterPanel.currentFilter;
    filterPanel.canvas.classList.add("loading");
    setTimeout(() => {
      filter.apply();
      filterPanel.canvas.classList.remove("loading");
    }, 0);
  };

  loadImage(url) {
    this.hide();
    filterPanel.show();
    const img = new Image();
    img.onload = (event) => this.handleImageOnloadEvent(event);
    img.src = url;
  }

  loadInputImage(event) {
    const file = event.currentTarget.files[0];
    this.loadFile(file);
    event.currentTarget.value = "";
  }

  loadFile(file) {
    if (!file.type.startsWith("image/")) return;
    if (file.type === "image/svg+xml") {
      alert("SVG is not supported.");
      return;
    }
    const url = URL.createObjectURL(file);
    this.loadImage(url);
  }

  async loadClipboardImage() {
    try {
      const items = await navigator.clipboard.read();
      const item = items[0];
      for (const type of item.types) {
        if (type === "image/svg+xml") {
          alert("SVG is not supported.");
        } else if (type.startsWith("image/")) {
          const file = await item.getType(type);
          const url = URL.createObjectURL(file);
          this.loadImage(url);
          break;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
}

class FilterPanel extends LoadPanel {
  mask;
  filters = {};

  constructor(panel) {
    super(panel);
    panel.querySelector(".saveClipboard").onclick = async (event) => {
      const svgs = event.currentTarget.children;
      svgs[0].classList.add("d-none");
      svgs[1].classList.remove("d-none");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": toBlob(this.canvas) }),
      ]);
      setTimeout(() => {
        svgs[0].classList.remove("d-none");
        svgs[1].classList.add("d-none");
      }, 2000);
    };
    panel.querySelector(".loadClipboard").onclick = (event) => {
      this.loadClipboardImage(event);
    };

    this.selectedIndex = 0;
    this.canvas = panel.querySelector(".image");
    this.canvasContext = this.canvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.originalCanvas = panel.querySelector(".originalImage");
    this.originalCanvasContext = this.originalCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.canvasContainer = this.canvas.parentNode;

    this.paintCanvas = panel.querySelector(".paintCanvas");
    this.paintCanvas.style.opacity = 0.5;
    this.paintCanvasContext = this.paintCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.paintPad = new signaturePad(this.paintCanvas, {
      penColor: "#fff",
    });
    this.updatePenSize(16);
    this.paintPad.addEventListener("endStroke", () => {
      this.canvas.classList.add("loading");
      setTimeout(() => {
        this.updateMask();
        this.currentFilter.apply();
        this.canvas.classList.remove("loading");
      }, 0);
    });
    this.frontWell = panel.querySelector(".front");
    this.eraserWell = panel.querySelector(".eraser");
    panel.querySelector(".penSize").oninput = (event) => {
      const penSize = event.target.value;
      this.updatePenSize(penSize);
    };
    this.frontWell.onclick = () => {
      this.paintPad.compositeOperation = "source-over";
      this.paintPad.penColor = "#fff";
      this.resizeWell(this.frontWell);
    };
    this.eraserWell.onclick = () => {
      this.paintPad.compositeOperation = "destination-out";
      this.resizeWell(this.eraserWell);
    };
    panel.querySelector(".opacity").oninput = (event) => {
      this.paintCanvas.style.opacity = event.target.value;
    };

    this.filterSelect = panel.querySelector(".filterSelect");
    this.filterSelect.onchange = () => this.filterSelectEvent();

    panel.querySelector(".moveTop").onclick = () => this.moveLoadPanel();
    panel.querySelector(".download").onclick = () => this.download();
    this.addFilters(panel);
  }

  drawCircle(canvas, canvasContext) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2;
    canvasContext.fillStyle = "#fff";
    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
    canvasContext.fill();
  }

  resizeWell(target) {
    [this.frontWell, this.eraserWell].forEach((well) => {
      if (well === target) {
        well.style.width = "96px";
        well.style.height = "96px";
      } else {
        well.style.width = "64px";
        well.style.height = "64px";
      }
    });
  }

  updatePenSize(penSize) {
    this.paintPad.dotSize = penSize;
    this.paintPad.minWidth = penSize;
    this.paintPad.maxWidth = penSize;
    this.updateCursor(penSize, this.paintCanvas);
  }

  updateCursor(size, target) {
    const canvas = document.createElement("canvas");
    canvas.width = size * 2;
    canvas.height = size * 2;
    const context = canvas.getContext("2d");
    context.beginPath();
    context.arc(size, size, size, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, 0.5)";
    context.fill();
    context.strokeStyle = "rgba(0, 0, 0, 0.5)";
    context.lineWidth = 1;
    context.stroke();
    const dataURL = canvas.toDataURL();
    target.style.cursor = `url(${dataURL}) ${size} ${size}, auto`;
  }

  getActualRect(canvas) {
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const naturalWidth = canvas.width;
    const naturalHeight = canvas.height;
    const aspectRatio = naturalWidth / naturalHeight;
    let width, height, top, left, right, bottom;
    if (canvasWidth / canvasHeight > aspectRatio) {
      width = canvasHeight * aspectRatio;
      height = canvasHeight;
      top = 0;
      left = (canvasWidth - width) / 2;
      right = left + width;
      bottom = canvasHeight;
    } else {
      width = canvasWidth;
      height = canvasWidth / aspectRatio;
      top = (canvasHeight - height) / 2;
      left = 0;
      right = canvasWidth;
      bottom = top + height;
    }
    return { width, height, top, left, right, bottom };
  }

  resizePaintPad() {
    const actualRect = this.getActualRect(this.canvas);
    this.paintCanvas.width = actualRect.width;
    this.paintCanvas.height = actualRect.height;
    this.paintCanvas.style.top = `${actualRect.top}px`;
    this.paintCanvas.style.left = `${actualRect.left}px`;
    this.paintPad.fromData(this.paintPad.toData());
  }

  show() {
    super.show();
    this.panel.scrollIntoView({ behavior: "instant" });
  }

  moveLoadPanel() {
    this.hide();
    loadPanel.show();
  }

  download() {
    this.canvas.toBlob((blob) => {
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "mask.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  filterSelectEvent() {
    const options = this.filterSelect.options;
    const selectedIndex = options.selectedIndex;
    const prevClass = options[this.selectedIndex].value;
    const currClass = options[selectedIndex].value;
    this.panel.querySelector(`.${prevClass}`).classList.add("d-none");
    this.panel.querySelector(`.${currClass}`).classList.remove("d-none");
    this.selectedIndex = selectedIndex;
    const filter = this.filters[currClass];
    this.currentFilter = filter;
    this.canvas.classList.add("loading");
    setTimeout(() => {
      this.currentFilter.apply();
      this.canvas.classList.remove("loading");
    }, 0);
  }

  addFilters(panel) {
    this.addBrightnessEvents(panel);
    this.addContrastEvents(panel);
    this.addUnsharpMaskEvents(panel);
    this.addMosaicEvents(panel);
    this.addColorChangeEvents(panel);
    this.addIlluminationChangeEvents(panel);
    this.addTextureFlatteningEvents(panel);
    this.addFillForegroundEvents(panel);
    this.currentFilter = this.filters.brightness;
  }

  addInputEvents(filter) {
    for (const input of Object.values(filter.inputs)) {
      input.addEventListener("input", () => {
        this.canvas.classList.add("loading");
        setTimeout(() => {
          filter.apply();
          this.canvas.classList.remove("loading");
        }, 0);
      });
    }
    for (const node of filter.root.querySelectorAll("button[title=reset]")) {
      node.onclick = () => {
        const rangeInput = node.previousElementSibling;
        rangeInput.value = rangeInput.dataset.value;
        rangeInput.dispatchEvent(new Event("input"));
      };
    }
  }

  updateMask() {
    const cols = this.mask.cols;
    const rows = this.mask.rows;
    const resizedCanvas = document.createElement("canvas");
    resizedCanvas.width = cols;
    resizedCanvas.height = rows;
    const resizedCanvasContext = resizedCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });
    resizedCanvasContext.drawImage(this.paintCanvas, 0, 0, cols, rows);
    const imageData = resizedCanvasContext.getImageData(0, 0, cols, rows);
    const uint8Array = imageData.data;
    const maskData = this.mask.data;
    for (let i = 0; i < maskData.length; i++) {
      const r = uint8Array[i * 4];
      if (r === 255) {
        maskData[i] = 255;
      } else {
        maskData[i] = 0;
      }
    }
  }

  addBrightnessEvents(panel) {
    const root = panel.querySelector(".brightness");
    this.filters.brightness = {
      root,
      apply: () => this.brightness(),
      inputs: {
        brightness: root.querySelector(".brightness"),
        blur: root.querySelector(".blur"),
      },
    };
    this.addInputEvents(this.filters.brightness);
  }

  brightness() {
    const filter = this.filters.brightness;
    const brightness = Number(filter.inputs.brightness.value);
    if (brightness === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const src = cv.imread(this.originalCanvas);
      const bgra = new cv.MatVector();
      cv.split(src, bgra);
      for (let i = 0; i < 3; i++) {
        const channel = bgra.get(i);
        channel.convertTo(channel, -1, 1, brightness);
        bgra.set(i, channel);
        channel.delete();
      }
      const effect = new cv.Mat();
      cv.merge(bgra, effect);
      bgra.delete();

      const blurSize = Number(filter.inputs.blur.value);
      const blurredMask = this.getBlurredMask(this.mask, blurSize);
      const result = this.applySeamlessEffect(src, effect, blurredMask);
      cv.imshow(this.canvas, result);
      src.delete();
      result.delete();
      blurredMask.delete();
    }
  }

  addContrastEvents(panel) {
    const root = panel.querySelector(".contrast");
    this.filters.contrast = {
      root,
      apply: () => this.contrast(),
      inputs: {
        contrast: root.querySelector(".contrast"),
        blur: root.querySelector(".blur"),
      },
    };
    this.addInputEvents(this.filters.contrast);
  }

  contrast() {
    const filter = this.filters.contrast;
    const contrast = Number(filter.inputs.contrast.value);
    if (contrast === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const src = cv.imread(this.originalCanvas);
      const bgra = new cv.MatVector();
      cv.split(src, bgra);
      for (let i = 0; i < 3; i++) {
        const channel = bgra.get(i);
        channel.convertTo(channel, -1, contrast, 0);
        bgra.set(i, channel);
        channel.delete();
      }
      const effect = new cv.Mat();
      cv.merge(bgra, effect);
      bgra.delete();

      const blurSize = Number(filter.inputs.blur.value);
      const blurredMask = this.getBlurredMask(this.mask, blurSize);
      const result = this.applySeamlessEffect(src, effect, blurredMask);
      cv.imshow(this.canvas, result);
      src.delete();
      result.delete();
      blurredMask.delete();
    }
  }

  addUnsharpMaskEvents(panel) {
    const root = panel.querySelector(".unsharpMask");
    this.filters.unsharpMask = {
      root,
      apply: () => this.unsharpMask(),
      inputs: {
        ksize: root.querySelector(".ksize"),
        strength: root.querySelector(".strength"),
        blur: root.querySelector(".blur"),
      },
    };
    this.addInputEvents(this.filters.unsharpMask);
  }

  unsharpMask() {
    const filter = this.filters.unsharpMask;
    const ksize = Number(filter.inputs.ksize.value);
    if (ksize === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const strength = Number(filter.inputs.strength.value);
      const src = cv.imread(this.originalCanvas);
      const effect = new cv.Mat();
      cv.boxFilter(
        src,
        effect,
        -1,
        new cv.Size(ksize, ksize),
        new cv.Point(-1, -1),
        true,
        cv.BORDER_DEFAULT,
      );
      const alpha = 1 + strength;
      const beta = -strength;
      const gamma = 0;
      cv.addWeighted(src, alpha, effect, beta, gamma, effect, -1);

      const blurSize = Number(filter.inputs.blur.value);
      const blurredMask = this.getBlurredMask(this.mask, blurSize);
      const result = this.applySeamlessEffect(src, effect, blurredMask);
      cv.imshow(this.canvas, result);
      src.delete();
      result.delete();
      blurredMask.delete();
    }
  }

  addMosaicEvents(panel) {
    const root = panel.querySelector(".mosaic");
    this.filters.mosaic = {
      root,
      apply: () => this.mosaic(),
      inputs: {
        dsize: root.querySelector(".dsize"),
        blur: root.querySelector(".blur"),
      },
    };
    this.addInputEvents(this.filters.mosaic);
  }

  mosaic() {
    const filter = this.filters.mosaic;
    const dsize = Number(filter.inputs.dsize.value);
    if (dsize === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const blurSize = Number(filter.inputs.blur.value);
      const src = cv.imread(this.originalCanvas);
      const effect = new cv.Mat();
      const w = src.cols;
      const h = src.rows;
      cv.resize(
        src,
        effect,
        new cv.Size(w / dsize, h / dsize),
        0,
        0,
        cv.INTER_AREA,
      );
      cv.resize(effect, effect, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);

      const blurredMask = this.getBlurredMask(this.mask, blurSize);
      const result = this.applySeamlessEffect(src, effect, blurredMask);
      cv.imshow(this.canvas, result);
      src.delete();
      effect.delete();
      result.delete();
      blurredMask.delete();
    }
  }

  addColorChangeEvents(panel) {
    const root = panel.querySelector(".colorChange");
    this.filters.colorChange = {
      root,
      apply: () => this.colorChange(),
      inputs: {
        R: root.querySelector(".R"),
        G: root.querySelector(".G"),
        B: root.querySelector(".B"),
      },
    };
    this.addInputEvents(this.filters.colorChange);
  }

  colorChange() {
    const filter = this.filters.colorChange;
    const R = Number(filter.inputs.R.value);
    const G = Number(filter.inputs.G.value);
    const B = Number(filter.inputs.B.value);
    if (R === 1 && G === 1 && B === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const src = cv.imread(this.originalCanvas);
      cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
      cv.colorChange(src, this.mask, src, R, G, B);
      cv.cvtColor(src, src, cv.COLOR_RGB2RGBA, 0);
      cv.imshow(this.canvas, src);
      src.delete();
    }
  }

  addIlluminationChangeEvents(panel) {
    const root = panel.querySelector(".illuminationChange");
    this.filters.illuminationChange = {
      root,
      apply: () => this.illuminationChange(),
      inputs: {
        alpha: root.querySelector(".alpha"),
        beta: root.querySelector(".beta"),
      },
    };
    this.addInputEvents(this.filters.illuminationChange);
  }

  illuminationChange() {
    const filter = this.filters.illuminationChange;
    const alpha = Number(filter.inputs.alpha.value);
    const beta = Number(filter.inputs.beta.value);
    if (alpha < 0 || beta < 0) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const src = cv.imread(this.originalCanvas);
      cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
      cv.illuminationChange(src, this.mask, src, alpha, beta);
      cv.cvtColor(src, src, cv.COLOR_RGB2RGBA, 0);
      cv.imshow(this.canvas, src);
      src.delete();
    }
  }

  addTextureFlatteningEvents(panel) {
    const root = panel.querySelector(".textureFlattening");
    this.filters.textureFlattening = {
      root,
      apply: () => this.textureFlattening(),
      inputs: {
        low: root.querySelector(".low"),
        high: root.querySelector(".high"),
        kernelSize: root.querySelector(".kernelSize"),
      },
    };
    this.addInputEvents(this.filters.textureFlattening);
  }

  textureFlattening() {
    const filter = this.filters.textureFlattening;
    const kernelSize = Number(filter.inputs.kernelSize.value) * 2 + 1;
    if (kernelSize === 1) {
      this.canvasContext.drawImage(this.originalCanvas, 0, 0);
    } else {
      const low = Number(filter.inputs.low.value);
      const high = Number(filter.inputs.high.value) + low;
      const src = cv.imread(this.originalCanvas);
      cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
      // TODO: buggy
      // TODO: works only kernelSize = 3,5,7
      cv.textureFlattening(src, this.mask, src, low, high, kernelSize);
      cv.cvtColor(src, src, cv.COLOR_RGB2RGBA, 0);
      cv.imshow(this.canvas, src);
      src.delete();
    }
  }

  addFillForegroundEvents(panel) {
    const root = panel.querySelector(".fillForeground");
    this.filters.fillForeground = {
      root,
      apply: () => this.fillForeground(),
      inputs: {
        bgColor: root.querySelector(".bgColor"),
        bgOpacity: root.querySelector(".bgOpacity"),
      },
    };
    this.addInputEvents(this.filters.fillForeground);
  }

  fillForeground() {
    const filter = this.filters.fillForeground;
    const color = filter.inputs.bgColor.value;
    const opacity = Number(filter.inputs.bgOpacity.value);
    const w = this.originalCanvas.width;
    const h = this.originalCanvas.height;
    const imageData = this.originalCanvasContext.getImageData(0, 0, w, h);
    const uint32Array = new Uint32Array(imageData.data.buffer);
    const maskData = this.mask.data;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const a = opacity;
    const rgba = (a << 24) | (b << 16) | (g << 8) | r;
    for (let i = 0; i < maskData.length; i++) {
      if (maskData[i] !== 0) uint32Array[i] = rgba;
    }
    this.canvasContext.putImageData(imageData, 0, 0);
  }

  getBlurredMask(mask, blurSize) {
    const blurredMask = new cv.Mat();
    const size = new cv.Size(blurSize, blurSize);
    cv.boxFilter(
      mask,
      blurredMask,
      cv.CV_8U,
      size,
      new cv.Point(-1, -1),
      true,
      cv.BORDER_DEFAULT,
    );
    return blurredMask;
  }

  applySeamlessEffect(src, dst, mask) {
    const maskColor = new cv.Mat();
    {
      const maskFloat = new cv.Mat();
      mask.convertTo(maskFloat, cv.CV_32FC1, 1.0 / 255.0);
      const maskVec = new cv.MatVector();
      maskVec.push_back(maskFloat);
      maskVec.push_back(maskFloat);
      maskVec.push_back(maskFloat);
      cv.merge(maskVec, maskColor);
      maskFloat.delete();
    }

    const srcRGB = new cv.Mat();
    const srcChannels = new cv.MatVector();
    {
      const srcFloat = new cv.Mat();
      src.convertTo(srcFloat, cv.CV_32FC4, 1.0 / 255.0);
      cv.split(srcFloat, srcChannels);
      const srcRGBVec = new cv.MatVector();
      srcRGBVec.push_back(srcChannels.get(0));
      srcRGBVec.push_back(srcChannels.get(1));
      srcRGBVec.push_back(srcChannels.get(2));
      cv.merge(srcRGBVec, srcRGB);
      srcFloat.delete();
    }

    const dstRGB = new cv.Mat();
    {
      const dstFloat = new cv.Mat();
      dst.convertTo(dstFloat, cv.CV_32FC4, 1.0 / 255.0);
      const dstChannels = new cv.MatVector();
      cv.split(dstFloat, dstChannels);
      const dstRGBVec = new cv.MatVector();
      dstRGBVec.push_back(dstChannels.get(0));
      dstRGBVec.push_back(dstChannels.get(1));
      dstRGBVec.push_back(dstChannels.get(2));
      cv.merge(dstRGBVec, dstRGB);
      dstFloat.delete();
      dstChannels.delete();
    }

    const resultRGB = new cv.Mat();
    {
      const partDst = new cv.Mat();
      const partSrc = new cv.Mat();
      cv.multiply(dstRGB, maskColor, partDst);
      dstRGB.delete();
      const invMaskColor = new cv.Mat();
      const ones = new cv.Mat(
        maskColor.rows,
        maskColor.cols,
        maskColor.type(),
        new cv.Scalar(1.0, 1.0, 1.0),
      );
      cv.subtract(ones, maskColor, invMaskColor);
      ones.delete();
      maskColor.delete();
      cv.multiply(srcRGB, invMaskColor, partSrc);
      srcRGB.delete();
      invMaskColor.delete();
      cv.add(partDst, partSrc, resultRGB);
      partDst.delete();
      partSrc.delete();
    }

    const result = new cv.Mat();
    {
      const resultVec = new cv.MatVector();
      resultVec.push_back(resultRGB);
      resultVec.push_back(srcChannels.get(3)); // alpha
      cv.merge(resultVec, result);
      result.convertTo(result, cv.CV_8UC4, 255.0);
      resultRGB.delete();
      srcChannels.delete();
    }
    return result;
  }

  setCanvas(canvas) {
    if (canvas.tagName.toLowerCase() === "img") {
      this.canvas.width = canvas.naturalWidth;
      this.canvas.height = canvas.naturalHeight;
      this.originalCanvas.width = canvas.naturalWidth;
      this.originalCanvas.height = canvas.naturalHeight;
    } else {
      this.canvas.width = canvas.width;
      this.canvas.height = canvas.height;
      this.originalCanvas.width = canvas.width;
      this.originalCanvas.height = canvas.height;
    }
    this.canvasContext.drawImage(canvas, 0, 0);
    this.originalCanvasContext.drawImage(canvas, 0, 0);
    this.resizePaintPad();
  }
}

loadConfig();
initLangSelect();
initTooltip();
setTransparentCSSVariables();
await loadScript(await getOpenCVPath());
cv = await cv();

const filterPanel = new FilterPanel(document.getElementById("filterPanel"));
const loadPanel = new LoadPanel(document.getElementById("loadPanel"));
document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
globalThis.addEventListener("resize", () => {
  filterPanel.resizePaintPad();
});
globalThis.ondragover = (event) => {
  event.preventDefault();
};
globalThis.ondrop = (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  loadPanel.loadFile(file);
};
globalThis.addEventListener("paste", (event) => {
  const item = event.clipboardData.items[0];
  const file = item.getAsFile();
  if (!file) return;
  loadPanel.loadFile(file);
});
