/*
 * Backstretch
 * http://srobbin.com/jquery-plugins/backstretch/
 *
 * Copyright (c) 2013 Scott Robbin
 * Licensed under the MIT license.
 */

(($, window, undefined) => {
	/** @const */
	const YOUTUBE_REGEXP =
		/^.*(youtu\.be\/|youtube\.com\/v\/|youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtube\.com\/watch\?.*\&v=)([^#\&\?]*).*/i;

	/* PLUGIN DEFINITION
	 * ========================= */

	$.fn.backstretch = function (images, options) {
		const args = arguments;

		/*
		 * Scroll the page one pixel to get the right window height on iOS
		 * Pretty harmless for everyone else
		 */
		if ($(window).scrollTop() === 0) {
			window.scrollTo(0, 0);
		}

		let returnValues;

		this.each(function (eachIndex) {
			const $this = $(this);
			let obj = $this.data("backstretch");

			// Do we already have an instance attached to this element?
			if (obj) {
				// Is this a method they're trying to execute?
				if (
					typeof args[0] === "string" &&
					typeof obj[args[0]] === "function"
				) {
					// Call the method
					let returnValue = obj[args[0]].apply(
						obj,
						Array.prototype.slice.call(args, 1),
					);
					if (returnValue === obj) {
						// If a method is chaining
						returnValue = undefined;
					}
					if (returnValue !== undefined) {
						returnValues = returnValues || [];
						returnValues[eachIndex] = returnValue;
					}

					return; // Nothing further to do
				}

				// Merge the old options with the new
				options = $.extend(obj.options, options);

				// Remove the old instance
				if (obj.hasOwnProperty("destroy")) {
					obj.destroy(true);
				}
			}

			// We need at least one image
			if (!images || (images && images.length === 0)) {
				const cssBackgroundImage = $this.css("background-image");
				if (cssBackgroundImage && cssBackgroundImage !== "none") {
					images = [
						{
							url: $this
								.css("backgroundImage")
								.replace(/url\(|\)|"|'/g, ""),
						},
					];
				} else {
					$.error(
						"No images were supplied for Backstretch, or element must have a CSS-defined background image.",
					);
				}
			}

			obj = new Backstretch(this, images, options || {});
			$this.data("backstretch", obj);
		});

		return returnValues
			? returnValues.length === 1
				? returnValues[0]
				: returnValues
			: this;
	};

	// If no element is supplied, we'll attach to body
	$.backstretch = (images, options) => {
		// Return the instance
		return $("body").backstretch(images, options).data("backstretch");
	};

	// Custom selector
	$.expr[":"].backstretch = (elem) =>
		$(elem).data("backstretch") !== undefined;

	/* DEFAULTS
	 * ========================= */

	$.fn.backstretch.defaults = {
		duration: 5000, // Amount of time in between slides (if slideshow)
		transition: "fade", // Type of transition between slides
		transitionDuration: 0, // Duration of transition between slides
		animateFirst: true, // Animate the transition of first image of slideshow in?
		alignX: 0.5, // The x-alignment for the image, can be 'left'|'center'|'right' or any number between 0.0 and 1.0
		alignY: 0.5, // The y-alignment for the image, can be 'top'|'center'|'bottom' or any number between 0.0 and 1.0
		paused: false, // Whether the images should slide after given duration
		start: 0, // Index of the first image to show
		preload: 2, // How many images preload at a time?
		preloadSize: 1, // How many images can we preload in parallel?
		resolutionRefreshRate: 2500, // How long to wait before switching resolution?
		resolutionChangeRatioThreshold: 0.1, // How much a change should it be before switching resolution?
	};

	/* STYLES
	 *
	 * Baked-in styles that we'll apply to our elements.
	 * In an effort to keep the plugin simple, these are not exposed as options.
	 * That said, anyone can override these in their own stylesheet.
	 * ========================= */
	const styles = {
		wrap: {
			left: 0,
			top: 0,
			overflow: "hidden",
			margin: 0,
			padding: 0,
			height: "100%",
			width: "100%",
			zIndex: -999999,
		},
		itemWrapper: {
			position: "absolute",
			display: "none",
			margin: 0,
			padding: 0,
			border: "none",
			width: "100%",
			height: "100%",
			zIndex: -999999,
		},
		item: {
			position: "absolute",
			margin: 0,
			padding: 0,
			border: "none",
			width: "100%",
			height: "100%",
			maxWidth: "none",
		},
	};

	/* Given an array of different options for an image,
	 * choose the optimal image for the container size.
	 *
	 * Given an image template (a string with {{ width }} and/or
	 * {{height}} inside) and a container object, returns the
	 * image url with the exact values for the size of that
	 * container.
	 *
	 * Returns an array of urls optimized for the specified resolution.
	 *
	 */
	const optimalSizeImages = (() => {
		/* Sorts the array of image sizes based on width */
		const widthInsertSort = (arr) => {
			for (let i = 1; i < arr.length; i++) {
				const tmp = arr[i];
				let j = i;
				while (
					arr[j - 1] &&
					parseInt(arr[j - 1].width, 10) > parseInt(tmp.width, 10)
				) {
					arr[j] = arr[j - 1];
					--j;
				}
				arr[j] = tmp;
			}

			return arr;
		};

		/* Given an array of various sizes of the same image and a container width,
		 * return the best image.
		 */
		const selectBest = (containerWidth, containerHeight, imageSizes) => {
			const devicePixelRatio = window.devicePixelRatio || 1;
			const deviceOrientation = getDeviceOrientation();
			const windowOrientation = getWindowOrientation();
			const wrapperOrientation =
				containerHeight > containerWidth
					? "portrait"
					: containerWidth > containerHeight
					  ? "landscape"
					  : "square";

			let lastAllowedImage = 0;
			let testWidth;

			for (let j = 0, image; j < imageSizes.length; j++) {
				image = imageSizes[j];

				// In case a new image was pushed in, process it:
				if (typeof image === "string") {
					image = imageSizes[j] = { url: image };
				}

				if (
					image.pixelRatio &&
					image.pixelRatio !== "auto" &&
					parseFloat(image.pixelRatio) !== devicePixelRatio
				) {
					// We disallowed choosing this image for current device pixel ratio,
					// So skip this one.
					continue;
				}

				if (
					image.deviceOrientation &&
					image.deviceOrientation !== deviceOrientation
				) {
					// We disallowed choosing this image for current device orientation,
					// So skip this one.
					continue;
				}

				if (
					image.windowOrientation &&
					image.windowOrientation !== deviceOrientation
				) {
					// We disallowed choosing this image for current window orientation,
					// So skip this one.
					continue;
				}

				if (
					image.orientation &&
					image.orientation !== wrapperOrientation
				) {
					// We disallowed choosing this image for current element's orientation,
					// So skip this one.
					continue;
				}

				// Mark this one as the last one we investigated
				// which does not violate device pixel ratio rules.
				// We may choose this one later if there's no match.
				lastAllowedImage = j;

				// For most images, we match the specified width against element width,
				// And enforcing a limit depending on the "pixelRatio" property if specified.
				// But if a pixelRatio="auto", then we consider the width as the physical width of the image,
				// And match it while considering the device's pixel ratio.
				testWidth = containerWidth;
				if (image.pixelRatio === "auto") {
					containerWidth *= devicePixelRatio;
				}

				// Stop when the width of the image is larger or equal to the container width
				if (image.width >= testWidth) {
					break;
				}
			}

			// Use the image located at where we stopped
			return imageSizes[Math.min(j, lastAllowedImage)];
		};

		const replaceTagsInUrl = (url, templateReplacer) => {
			if (typeof url === "string") {
				// url = url.replace(/{{(width|height)}}/g, templateReplacer);
			} else if (Array.isArray(url)) {
				for (let i = 0; i < url.length; i++) {
					if (url[i].src) {
						url[i].src = replaceTagsInUrl(
							url[i].src,
							templateReplacer,
						);
					} else {
						url[i] = replaceTagsInUrl(url[i], templateReplacer);
					}
				}
			}

			return url;
		};

		return ($container, images) => {
			const containerWidth = $container.width();
			const containerHeight = $container.height();

			const chosenImages = [];

			const templateReplacer = (match, key) => {
				if (key === "width") {
					return containerWidth;
				}
				if (key === "height") {
					return containerHeight;
				}
				return match;
			};

			for (let i = 0; i < images.length; i++) {
				if ($.isArray(images[i])) {
					images[i] = widthInsertSort(images[i]);
					const chosen = selectBest(
						containerWidth,
						containerHeight,
						images[i],
					);
					chosenImages.push(chosen);
				} else {
					// In case a new image was pushed in, process it:
					if (typeof images[i] === "string") {
						images[i] = { url: images[i] };
					}

					const item = $.extend({}, images[i]);
					// Liya modified here.
					item.url = replaceTagsInUrl(item.url, templateReplacer);
					chosenImages.push(item);
				}
			}
			return chosenImages;
		};
	})();

	const isVideoSource = (source) =>
		YOUTUBE_REGEXP.test(source.url) || source.isVideo;

	/* Preload images */
	const preload = ((sources, startAt, count, batchSize, callback) => {
		// Plugin cache
		const cache = [];

		// Wrapper for cache
		const caching = (image) => {
			for (let i = 0; i < cache.length; i++) {
				if (cache[i].src === image.src) {
					return cache[i];
				}
			}
			cache.push(image);
			return image;
		};

		// Execute callback
		const exec = (sources, callback, last) => {
			if (typeof callback === "function") {
				callback.call(sources, last);
			}
		};

		// Closure to hide cache
		return function preload(sources, startAt, count, batchSize, callback) {
			// Check input data
			if (typeof sources === "undefined") {
				return;
			}
			if (!$.isArray(sources)) {
				sources = [sources];
			}

			if (
				arguments.length < 5 &&
				typeof arguments[arguments.length - 1] === "function"
			) {
				callback = arguments[arguments.length - 1];
			}

			startAt = typeof startAt === "function" || !startAt ? 0 : startAt;
			count =
				typeof count === "function" || !count || count < 0
					? sources.length
					: Math.min(count, sources.length);
			batchSize =
				typeof batchSize === "function" || !batchSize ? 1 : batchSize;

			if (startAt >= sources.length) {
				startAt = 0;
				count = 0;
			}
			if (batchSize < 0) {
				batchSize = count;
			}
			batchSize = Math.min(batchSize, count);

			const next = sources.slice(startAt + batchSize, count - batchSize);
			sources = sources.slice(startAt, batchSize);
			count = sources.length;

			// If sources array is empty
			if (!count) {
				exec(sources, callback, true);
				return;
			}

			// Image loading callback
			let countLoaded = 0;

			const loaded = () => {
				countLoaded++;
				if (countLoaded !== count) {
					return;
				}

				exec(sources, callback, !next);
				preload(next, 0, 0, batchSize, callback);
			};

			// Loop sources to preload
			let image;

			for (let i = 0; i < sources.length; i++) {
				if (isVideoSource(sources[i])) {
				} else {
					image = new Image();
					image.src = sources[i].url;

					image = caching(image);

					if (image.complete) {
						loaded();
					} else {
						$(image).on("load error", loaded);
					}
				}
			}
		};
	})();

	/* Process images array */
	const processImagesArray = (images) => {
		const processed = [];
		for (let i = 0; i < images.length; i++) {
			if (typeof images[i] === "string") {
				processed.push({ url: images[i] });
			} else if ($.isArray(images[i])) {
				processed.push(processImagesArray(images[i]));
			} else {
				processed.push(processOptions(images[i]));
			}
		}
		return processed;
	};

	/* Process options */
	const processOptions = (options, required) => {
		// Convert old options

		// centeredX/centeredY are deprecated
		if (options.centeredX || options.centeredY) {
			if (window.console?.log) {
				window.console.log(
					"jquery.backstretch: `centeredX`/`centeredY` is deprecated, please use `alignX`/`alignY`",
				);
			}
			if (options.centeredX) {
				options.alignX = 0.5;
			}
			if (options.centeredY) {
				options.alignY = 0.5;
			}
		}

		// Deprecated spec
		if (options.speed !== undefined) {
			if (window.console?.log) {
				window.console.log(
					"jquery.backstretch: `speed` is deprecated, please use `transitionDuration`",
				);
			}

			options.transitionDuration = options.speed;
			options.transition = "fade";
		}

		// Typo
		if (options.resolutionChangeRatioTreshold !== undefined) {
			window.console.log("jquery.backstretch: `treshold` is a typo!");
			options.resolutionChangeRatioThreshold =
				options.resolutionChangeRatioTreshold;
		}

		// Current spec that needs processing

		if (options.fadeFirst !== undefined) {
			options.animateFirst = options.fadeFirst;
		}

		if (options.fade !== undefined) {
			options.transitionDuration = options.fade;
			options.transition = "fade";
		}

		if (options.scale) {
			options.scale = validScale(options.scale);
		}

		return processAlignOptions(options);
	};

	/* Process align options */
	const processAlignOptions = (options, required) => {
		if (options.alignX === "left") {
			options.alignX = 0.0;
		} else if (options.alignX === "center") {
			options.alignX = 0.5;
		} else if (options.alignX === "right") {
			options.alignX = 1.0;
		} else if (options.alignX !== undefined || required) {
			options.alignX = parseFloat(options.alignX);
			if (Number.isNaN(options.alignX)) {
				options.alignX = 0.5;
			}
		}

		if (options.alignY === "top") {
			options.alignY = 0.0;
		} else if (options.alignY === "center") {
			options.alignY = 0.5;
		} else if (options.alignY === "bottom") {
			options.alignY = 1.0;
		} else if (options.alignX !== undefined || required) {
			options.alignY = parseFloat(options.alignY);
			if (Number.isNaN(options.alignY)) {
				options.alignY = 0.5;
			}
		}

		return options;
	};

	const SUPPORTED_SCALE_OPTIONS = {
		cover: "cover",
		fit: "fit",
		"fit-smaller": "fit-smaller",
		fill: "fill",
	};

	function validScale(scale) {
		if (!SUPPORTED_SCALE_OPTIONS.hasOwnProperty(scale)) {
			return "cover";
		}
		return scale;
	}

	/* CLASS DEFINITION
	 * ========================= */
	const Backstretch = function (container, images, options) {
		this.options = $.extend({}, $.fn.backstretch.defaults, options || {});

		this.firstShow = true;

		// Process options
		processOptions(this.options, true);

		/* In its simplest form, we allow Backstretch to be called on an image path.
		 * e.g. $.backstretch('/path/to/image.jpg')
		 * So, we need to turn this back into an array.
		 */
		this.images = processImagesArray($.isArray(images) ? images : [images]);

		/**
		 * Paused-Option
		 */
		if (this.options.paused) {
			this.paused = true;
		}

		/**
		 * Start-Option (Index)
		 */
		if (this.options.start >= this.images.length) {
			this.options.start = this.images.length - 1;
		}
		if (this.options.start < 0) {
			this.options.start = 0;
		}

		// Convenience reference to know if the container is body.
		this.isBody = container === document.body;

		/* We're keeping track of a few different elements
		 *
		 * Container: the element that Backstretch was called on.
		 * Wrap: a DIV that we place the image into, so we can hide the overflow.
		 * Root: Convenience reference to help calculate the correct height.
		 */
		const $window = $(window);
		this.$container = $(container);
		this.$root = this.isBody
			? supportsFixedPosition
				? $window
				: $(document)
			: this.$container;

		this.originalImages = this.images;
		this.images = optimalSizeImages(
			this.options.alwaysTestWindowResolution ? $window : this.$root,
			this.originalImages,
		);

		/**
		 * Pre-Loading.
		 * This is the first image, so we will preload a minimum of 1 images.
		 */
		preload(
			this.images,
			this.options.start || 0,
			this.options.preload || 1,
		);

		// Don't create a new wrap if one already exists (from a previous instance of Backstretch)
		const $existing = this.$container.children(".backstretch").first();
		this.$wrap = $existing.length
			? $existing
			: $('<div class="backstretch"></div>')
					.css(this.options.bypassCss ? {} : styles.wrap)
					.appendTo(this.$container);

		if (!this.options.bypassCss) {
			// Non-body elements need some style adjustments
			if (!this.isBody) {
				// If the container is statically positioned, we need to make it relative,
				// and if no zIndex is defined, we should set it to zero.
				const position = this.$container.css("position");
				const zIndex = this.$container.css("zIndex");

				this.$container.css({
					position: position === "static" ? "relative" : position,
					zIndex: zIndex === "auto" ? 0 : zIndex,
				});

				// Needs a higher z-index
				this.$wrap.css({ zIndex: -999998 });
			}

			// Fixed or absolute positioning?
			this.$wrap.css({
				position:
					this.isBody && supportsFixedPosition ? "fixed" : "absolute",
			});
		}

		// Set the first image
		this.index = this.options.start;
		this.show(this.index);

		// Listen for resize
		$window.on("resize.backstretch", $.proxy(this.resize, this)).on(
			"orientationchange.backstretch",
			$.proxy(function () {
				// Need to do this in order to get the right window height
				if (this.isBody && window.pageYOffset === 0) {
					window.scrollTo(0, 1);
					this.resize();
				}
			}, this),
		);
	};

	const performTransition = (options) => {
		let transition = options.transition || "fade";

		// Look for multiple options
		if (typeof transition === "string" && transition.indexOf("|") > -1) {
			transition = transition.split("|");
		}

		if (Array.isArray(transition)) {
			transition =
				transition[Math.round(Math.random() * (transition.length - 1))];
		}

		const $new = options["new"];
		const $old = options["old"] ? options["old"] : $([]);

		switch (transition.toString().toLowerCase()) {
			default: {
				$new.fadeIn({
					duration: options.duration,
					complete: options.complete,
					easing: options.easing || undefined,
				});
				break;
			}

			case "fadeinout":
			case "fade_in_out": {
				const fadeInNew = () => {
					$new.fadeIn({
						duration: options.duration / 2,
						complete: options.complete,
						easing: options.easing || undefined,
					});
				};

				if ($old.length) {
					$old.fadeOut({
						duration: options.duration / 2,
						complete: fadeInNew,
						easing: options.easing || undefined,
					});
				} else {
					fadeInNew();
				}

				break;
			}

			case "pushleft":
			case "push_left":
			case "pushright":
			case "push_right":
			case "pushup":
			case "push_up":
			case "pushdown":
			case "push_down":
			case "coverleft":
			case "cover_left":
			case "coverright":
			case "cover_right":
			case "coverup":
			case "cover_up":
			case "coverdown":
			case "cover_down": {
				const transitionParts =
					transition.match(/^(cover|push)_?(.*)$/);

				const animProp =
					transitionParts[2] === "left"
						? "right"
						: transitionParts[2] === "right"
						  ? "left"
						  : transitionParts[2] === "down"
							  ? "top"
							  : transitionParts[2] === "up"
								  ? "bottom"
								  : "right";

				const newCssStart = {
					display: "",
				};
				const newCssAnim = {};
				newCssStart[animProp] = "-100%";
				newCssAnim[animProp] = 0;

				$new.css(newCssStart).animate(newCssAnim, {
					duration: options.duration,
					complete: function () {
						$new.css(animProp, "");
						options.complete.apply(this, arguments);
					},
					easing: options.easing || undefined,
				});

				if (transitionParts[1] === "push" && $old.length) {
					const oldCssAnim = {};
					oldCssAnim[animProp] = "100%";

					$old.animate(oldCssAnim, {
						duration: options.duration,
						complete: () => {
							$old.css("display", "none");
						},
						easing: options.easing || undefined,
					});
				}

				break;
			}
		}
	};

	/* PUBLIC METHODS
	 * ========================= */
	Backstretch.prototype = {
		resize: function () {
			try {
				// Check for a better suited image after the resize
				const $resTest = this.options.alwaysTestWindowResolution
					? $(window)
					: this.$root;
				const newContainerWidth = $resTest.width();
				const newContainerHeight = $resTest.height();
				const changeRatioW =
					newContainerWidth / (this._lastResizeContainerWidth || 0);
				const changeRatioH =
					newContainerHeight / (this._lastResizeContainerHeight || 0);
				const resolutionChangeRatioThreshold =
					this.options.resolutionChangeRatioThreshold || 0.0;

				// check for big changes in container size
				if (
					(newContainerWidth !== this._lastResizeContainerWidth ||
						newContainerHeight !==
							this._lastResizeContainerHeight) &&
					(Math.abs(changeRatioW - 1) >=
						resolutionChangeRatioThreshold ||
						Number.isNaN(changeRatioW) ||
						Math.abs(changeRatioH - 1) >=
							resolutionChangeRatioThreshold ||
						Number.isNaN(changeRatioH))
				) {
					this._lastResizeContainerWidth = newContainerWidth;
					this._lastResizeContainerHeight = newContainerHeight;

					// Big change: rebuild the entire images array
					this.images = optimalSizeImages(
						$resTest,
						this.originalImages,
					);

					// Preload them (they will be automatically inserted on the next cycle)
					if (this.options.preload) {
						preload(
							this.images,
							(this.index + 1) % this.images.length,
							this.options.preload,
						);
					}

					// In case there is no cycle and the new source is different than the current
					if (
						this.images.length === 1 &&
						this._currentImage.url !== this.images[0].url
					) {
						clearTimeout(this._selectAnotherResolutionTimeout);
						this._selectAnotherResolutionTimeout = setTimeout(
							() => {
								this.show(0);
							},
							this.options.resolutionRefreshRate,
						);
					}
				}

				const bgCSS = {
					left: 0,
					top: 0,
					right: "auto",
					bottom: "auto",
				};
				const boxWidth = this.isBody
					? this.$root.width()
					: this.$root.innerWidth();
				const boxHeight = this.isBody
					? window.innerHeight
						? window.innerHeight
						: this.$root.height()
					: this.$root.innerHeight();
				const naturalWidth = this.$itemWrapper.data("width");
				const naturalHeight = this.$itemWrapper.data("height");
				const ratio = naturalWidth / naturalHeight || 1;
				const alignX =
					this._currentImage.alignX === undefined
						? this.options.alignX
						: this._currentImage.alignX;
				const alignY =
					this._currentImage.alignY === undefined
						? this.options.alignY
						: this._currentImage.alignY;
				const scale = validScale(
					this._currentImage.scale || this.options.scale,
				);

				let width;
				let height;

				if (scale === "fit" || scale === "fit-smaller") {
					width = naturalWidth;
					height = naturalHeight;

					if (
						width > boxWidth ||
						height > boxHeight ||
						scale === "fit-smaller"
					) {
						const boxRatio = boxWidth / boxHeight;
						if (boxRatio > ratio) {
							width = Math.floor(boxHeight * ratio);
							height = boxHeight;
						} else if (boxRatio < ratio) {
							width = boxWidth;
							height = Math.floor(boxWidth / ratio);
						} else {
							width = boxWidth;
							height = boxHeight;
						}
					}
				} else if (scale === "fill") {
					width = boxWidth;
					height = boxHeight;
				} else {
					// 'cover'
					width = Math.max(boxHeight * ratio, boxWidth);
					height = Math.max(width / ratio, boxHeight);
				}

				// Make adjustments based on image ratio
				bgCSS.top = -(height - boxHeight) * alignY;
				bgCSS.left = -(width - boxWidth) * alignX;
				bgCSS.width = width;
				bgCSS.height = height;

				if (!this.options.bypassCss) {
					this.$wrap
						.css({ width: boxWidth, height: boxHeight })
						.find(">.backstretch-item")
						.not(".deleteable")
						.each(function () {
							const $wrapper = $(this);
							$wrapper.find("img,video,iframe").css(bgCSS);
						});
				}

				const evt = $.Event("backstretch.resize", {
					relatedTarget: this.$container[0],
				});
				this.$container.trigger(evt, this);
			} catch (err) {
				// IE7 seems to trigger resize before the image is loaded.
				// This try/catch block is a hack to let it fail gracefully.
			}

			return this;
		},

		// Show the slide at a certain position
		show: function (newIndex, overrideOptions) {
			// Validate index
			if (Math.abs(newIndex) > this.images.length - 1) {
				return;
			}

			// Vars
			const that = this;
			const $oldItemWrapper = that.$wrap
				.find(">.backstretch-item")
				.addClass("deleteable");
			const oldVideoWrapper = that.videoWrapper;
			const evtOptions = { relatedTarget: that.$container[0] };

			// Trigger the "before" event
			that.$container.trigger($.Event("backstretch.before", evtOptions), [
				that,
				newIndex,
			]);

			// Set the new frame index
			this.index = newIndex;
			const selectedImage = that.images[newIndex];

			// Pause the slideshow
			clearTimeout(that._cycleTimeout);

			// New image

			that.videoWrapper = undefined; // Current item may not be a video

			const isVideo = isVideoSource(selectedImage);
			if (isVideo) {
				that.videoWrapper = new VideoWrapper(selectedImage);
				that.$item = that.videoWrapper.$video.css(
					"pointer-events",
					"none",
				);
			} else {
				that.$item = $("<img />");
			}

			that.$itemWrapper = $('<div class="backstretch-item">').append(
				that.$item,
			);

			if (this.options.bypassCss) {
				that.$itemWrapper.css({
					display: "none",
				});
			} else {
				that.$itemWrapper.css(styles.itemWrapper);
				that.$item.css(styles.item);
			}

			that.$item.bind(isVideo ? "canplay" : "load", function (e) {
				const $this = $(this);
				const $wrapper = $this.parent();
				let options = $wrapper.data("options");

				if (overrideOptions) {
					options = $.extend({}, options, overrideOptions);
				}

				const imgWidth =
					this.naturalWidth || this.videoWidth || this.width;
				const imgHeight =
					this.naturalHeight || this.videoHeight || this.height;

				// Save the natural dimensions
				$wrapper.data("width", imgWidth).data("height", imgHeight);

				const getOption = (opt) =>
					options[opt] !== undefined
						? options[opt]
						: that.options[opt];

				const transition = getOption("transition");
				const transitionEasing = getOption("transitionEasing");
				const transitionDuration = getOption("transitionDuration");

				// Show the image, then delete the old one
				const bringInNextImage = () => {
					if (oldVideoWrapper) {
						oldVideoWrapper.stop();
						oldVideoWrapper.destroy();
					}

					$oldItemWrapper.remove();

					// Resume the slideshow
					if (!that.paused && that.images.length > 1) {
						that.cycle();
					}

					// Now we can clear the background on the element, to spare memory
					if (!(that.options.bypassCss || that.isBody)) {
						that.$container.css("background-image", "none");
					}

					// Trigger the "after" and "show" events
					// "show" is being deprecated
					$(["after", "show"]).each(function () {
						that.$container.trigger(
							$.Event(`backstretch.${this}`, evtOptions),
							[that, newIndex],
						);
					});

					if (isVideo) {
						that.videoWrapper.play();
					}
				};

				if (
					(that.firstShow && !that.options.animateFirst) ||
					!transitionDuration ||
					!transition
				) {
					// Avoid transition on first show or if there's no transitionDuration value
					$wrapper.show();
					bringInNextImage();
				} else {
					performTransition({
						new: $wrapper,
						old: $oldItemWrapper,
						transition: transition,
						duration: transitionDuration,
						easing: transitionEasing,
						complete: bringInNextImage,
					});
				}

				that.firstShow = false;

				// Resize
				that.resize();
			});

			that.$itemWrapper.appendTo(that.$wrap);

			that.$item.attr("alt", selectedImage.alt || "");
			that.$itemWrapper.data("options", selectedImage);

			if (!isVideo) {
				that.$item.attr("src", selectedImage.url);
			}

			that._currentImage = selectedImage;

			return that;
		},

		current: function () {
			return this.index;
		},

		next: function () {
			const args = Array.prototype.slice.call(arguments, 0);
			args.unshift(
				this.index < this.images.length - 1 ? this.index + 1 : 0,
			);
			return this.show.apply(this, args);
		},

		prev: function () {
			const args = Array.prototype.slice.call(arguments, 0);
			args.unshift(
				this.index === 0 ? this.images.length - 1 : this.index - 1,
			);
			return this.show.apply(this, args);
		},

		pause: function () {
			// Pause the slideshow
			this.paused = true;

			if (this.videoWrapper) {
				this.videoWrapper.pause();
			}

			return this;
		},

		resume: function () {
			// Resume the slideshow
			this.paused = false;

			if (this.videoWrapper) {
				this.videoWrapper.play();
			}

			this.cycle();
			return this;
		},

		cycle: function () {
			// Start/resume the slideshow
			if (this.images.length > 1) {
				// Clear the timeout, just in case
				clearTimeout(this._cycleTimeout);

				const duration =
					this._currentImage?.duration || this.options.duration;
				const isVideo = isVideoSource(this._currentImage);

				const callNext = function () {
					this.$item.off(".cycle");

					// Check for paused slideshow
					if (!this.paused) {
						this.next();
					}
				};

				// Special video handling
				if (isVideo) {
					// Leave video at last frame
					if (!this._currentImage.loop) {
						let lastFrameTimeout = 0;

						this.$item
							.on("playing.cycle", function () {
								const player = $(this).data("player");

								clearTimeout(lastFrameTimeout);
								lastFrameTimeout = setTimeout(
									() => {
										player.pause();
										player.$video.trigger("ended");
									},
									(player.getDuration() -
										player.getCurrentTime()) *
										1000,
								);
							})
							.on("ended.cycle", () => {
								clearTimeout(lastFrameTimeout);
							});
					}

					// On error go to next
					this.$item.on(
						"error.cycle initerror.cycle",
						$.proxy(callNext, this),
					);
				}

				if (isVideo && !this._currentImage.duration) {
					// It's a video - playing until end
					this.$item.on("ended.cycle", $.proxy(callNext, this));
				} else {
					// Cycling according to specified duration
					this._cycleTimeout = setTimeout(
						$.proxy(callNext, this),
						duration,
					);
				}
			}
			return this;
		},

		destroy: function (preserveBackground) {
			// Stop the resize events
			$(window).off("resize.backstretch orientationchange.backstretch");

			// Stop any videos
			if (this.videoWrapper) {
				this.videoWrapper.destroy();
			}

			// Clear the timeout
			clearTimeout(this._cycleTimeout);

			// Remove Backstretch
			if (!preserveBackground) {
				this.$wrap.remove();
			}
			this.$container.removeData("backstretch");
		},
	};

	/**
	 * Video Abstraction Layer
	 *
	 * Static methods:
	 * > VideoWrapper.loadYoutubeAPI() -> Call in order to load the Youtube API.
	 *                                   An 'youtube_api_load' event will be triggered on $(window) when the API is loaded.
	 *
	 * Generic:
	 * > player.type -> type of the video
	 * > player.video / player.$video -> contains the element holding the video
	 * > player.play() -> plays the video
	 * > player.pause() -> pauses the video
	 * > player.setCurrentTime(position) -> seeks to a position by seconds
	 *
	 * Youtube:
	 * > player.ytId will contain the youtube ID if the source is a youtube url
	 * > player.ytReady is a flag telling whether the youtube source is ready for playback
	 * */

	const VideoWrapper = function () {
		this.init.apply(this, arguments);
	};

	/**
	 * @param {Object} options
	 * @param {String|Array<String>|Array<{{src: String, type: String?}}>} options.url
	 * @param {Boolean} options.loop=false
	 * @param {Boolean?} options.mute=true
	 * @param {String?} options.poster
	 * loop, mute, poster
	 */
	VideoWrapper.prototype.init = function (options) {
		let $video;

		const setVideoElement = () => {
			this.$video = $video;
			this.video = $video[0];
		};

		// Determine video type

		let videoType = "video";

		if (!Array.isArray(options.url) && YOUTUBE_REGEXP.test(options.url)) {
			videoType = "youtube";
		}

		this.type = videoType;

		if (videoType === "youtube") {
			// Try to load the API in the meantime
			VideoWrapper.loadYoutubeAPI();

			this.ytId = options.url.match(YOUTUBE_REGEXP)[2];
			const src = `https://www.youtube.com/embed/${
				this.ytId
			}?rel=0&autoplay=0&showinfo=0&controls=0&modestbranding=1&cc_load_policy=0&disablekb=1&iv_load_policy=3&loop=0&enablejsapi=1&origin=${encodeURIComponent(
				window.location.origin,
			)}`;

			this.__ytStartMuted = !!options.mute || options.mute === undefined;

			$video = $("<iframe />")
				.attr({ src_to_load: src })
				.css({ border: 0, margin: 0, padding: 0 })
				.data("player", this);

			if (options.loop) {
				$video.on("ended.loop", () => {
					if (!this.__manuallyStopped) {
						this.play();
					}
				});
			}

			this.ytReady = false;

			setVideoElement();

			if (window["YT"]) {
				this._initYoutube();
				$video.trigger("initsuccess");
			} else {
				$(window).one("youtube_api_load", () => {
					this._initYoutube();
					$video.trigger("initsuccess");
				});
			}
		} else {
			// Traditional <video> tag with multiple sources

			$video = $("<video>")
				.prop("autoplay", false)
				.prop("controls", false)
				.prop("loop", !!options.loop)
				.prop("muted", !!options.mute || options.mute === undefined)

				// Let the first frames be available before playback, as we do transitions
				.prop("preload", "auto")
				.prop("poster", options.poster || "");

			const sources = Array.isArray(options.url)
				? options.url
				: [options.url];

			for (let i = 0; i < sources.length; i++) {
				let sourceItem = sources[i];
				if (typeof sourceItem === "string") {
					sourceItem = { src: sourceItem };
				}
				$("<source>")
					.attr("src", sourceItem.src)
					// Make sure to not specify type if unknown -
					//   so the browser will try to autodetect.
					.attr("type", sourceItem.type || null)
					.appendTo($video);
			}

			if ($video[0].canPlayType && sources.length) {
				$video.trigger("initsuccess");
			} else {
				$video.trigger("initerror");
			}

			setVideoElement();
		}
	};

	VideoWrapper.prototype._initYoutube = function () {
		const YT = window["YT"];

		this.$video
			.attr("src", this.$video.attr("src_to_load"))
			.removeAttr("src_to_load");

		// It won't init if it's not in the DOM, so we emulate that
		const hasParent = !!this.$video[0].parentNode;
		if (!hasParent) {
			const $tmpParent = $("<div>")
				.css("display", "none !important")
				.appendTo(document.body);
			this.$video.appendTo($tmpParent);
		}

		const player = new YT.Player(this.video, {
			events: {
				onReady: () => {
					if (this.__ytStartMuted) {
						player.mute();
					}

					if (!hasParent) {
						// Restore parent to old state - without interrupting any changes
						if (this.$video[0].parentNode === $tmpParent[0]) {
							this.$video.detach();
						}
						$tmpParent.remove();
					}

					this.ytReady = true;
					this._updateYoutubeSize();
					this.$video.trigger("canplay");
				},
				onStateChange: (event) => {
					switch (event.data) {
						case YT.PlayerState.PLAYING: {
							this.$video.trigger("playing");
							break;
						}
						case YT.PlayerState.ENDED: {
							this.$video.trigger("ended");
							break;
						}
						case YT.PlayerState.PAUSED: {
							this.$video.trigger("pause");
							break;
						}
						case YT.PlayerState.BUFFERING: {
							this.$video.trigger("waiting");
							break;
						}
						case YT.PlayerState.CUED: {
							this.$video.trigger("canplay");
							break;
						}
					}
				},
				onPlaybackQualityChange: () => {
					this._updateYoutubeSize();
					this.$video.trigger("resize");
				},
				onError: (err) => {
					this.hasError = true;
					this.$video.trigger({ type: "error", error: err });
				},
			},
		});

		this.ytPlayer = player;

		return this;
	};

	VideoWrapper.prototype._updateYoutubeSize = function () {
		switch (this.ytPlayer.getPlaybackQuality() || "medium") {
			case "small": {
				this.video.videoWidth = 426;
				this.video.videoHeight = 240;
				break;
			}
			case "medium": {
				this.video.videoWidth = 640;
				this.video.videoHeight = 360;
				break;
			}
			default: {
				this.video.videoWidth = 854;
				this.video.videoHeight = 480;
				break;
			}
			case "hd720": {
				this.video.videoWidth = 1280;
				this.video.videoHeight = 720;
				break;
			}
			case "hd1080": {
				this.video.videoWidth = 1920;
				this.video.videoHeight = 1080;
				break;
			}
			case "highres": {
				this.video.videoWidth = 2560;
				this.video.videoHeight = 1440;
				break;
			}
		}

		return this;
	};

	VideoWrapper.prototype.play = function () {
		this.__manuallyStopped = false;

		if (this.type === "youtube") {
			if (this.ytReady) {
				this.$video.trigger("play");
				this.ytPlayer.playVideo();
			}
		} else {
			this.video.play();
		}

		return this;
	};

	VideoWrapper.prototype.pause = function () {
		this.__manuallyStopped = false;

		if (this.type === "youtube") {
			if (this.ytReady) {
				this.ytPlayer.pauseVideo();
			}
		} else {
			this.video.pause();
		}

		return this;
	};

	VideoWrapper.prototype.stop = function () {
		this.__manuallyStopped = true;

		if (this.type === "youtube") {
			if (this.ytReady) {
				this.ytPlayer.pauseVideo();
				this.ytPlayer.seekTo(0);
			}
		} else {
			this.video.pause();
			this.video.currentTime = 0;
		}

		return this;
	};

	VideoWrapper.prototype.destroy = function () {
		if (this.ytPlayer) {
			this.ytPlayer.destroy();
		}

		this.$video.remove();

		return this;
	};

	VideoWrapper.prototype.getCurrentTime = function (seconds) {
		if (this.type === "youtube") {
			if (this.ytReady) {
				return this.ytPlayer.getCurrentTime();
			}
		} else {
			return this.video.currentTime;
		}

		return 0;
	};

	VideoWrapper.prototype.setCurrentTime = function (seconds) {
		if (this.type === "youtube") {
			if (this.ytReady) {
				this.ytPlayer.seekTo(seconds, true);
			}
		} else {
			this.video.currentTime = seconds;
		}

		return this;
	};

	VideoWrapper.prototype.getDuration = function () {
		if (this.type === "youtube") {
			if (this.ytReady) {
				return this.ytPlayer.getDuration();
			}
		} else {
			return this.video.duration;
		}

		return 0;
	};

	/**
	 * This will load the youtube API (if not loaded yet)
	 * Use $(window).one('youtube_api_load', ...) to listen for API loaded event
	 */
	VideoWrapper.loadYoutubeAPI = () => {
		if (window["YT"]) {
			return;
		}
		if (!$("script[src*=www\\.youtube\\.com\\/iframe_api]").length) {
			$(
				'<script type="text/javascript" src="https://www.youtube.com/iframe_api">',
			).appendTo("body");
		}
		const ytAPILoadInt = setInterval(() => {
			if (window["YT"]?.loaded) {
				$(window).trigger("youtube_api_load");
				clearTimeout(ytAPILoadInt);
			}
		}, 50);
	};

	const getDeviceOrientation = () => {
		if ("matchMedia" in window) {
			if (window.matchMedia("(orientation: portrait)").matches) {
				return "portrait";
			} else if (window.matchMedia("(orientation: landscape)").matches) {
				return "landscape";
			}
		}

		if (screen.height > screen.width) {
			return "portrait";
		}

		// Even square devices have orientation,
		//   but a desktop browser may be too old for `matchMedia`.
		// Defaulting to `landscape` for the VERY rare case of a square desktop screen is good enough.
		return "landscape";
	};

	const getWindowOrientation = () => {
		if (window.innerHeight > window.innerWidth) {
			return "portrait";
		}
		if (window.innerWidth > window.innerHeight) {
			return "landscape";
		}

		return "square";
	};

	/* SUPPORTS FIXED POSITION?
	 *
	 * Based on code from jQuery Mobile 1.1.0
	 * http://jquerymobile.com/
	 *
	 * In a nutshell, we need to figure out if fixed positioning is supported.
	 * Unfortunately, this is very difficult to do on iOS, and usually involves
	 * injecting content, scrolling the page, etc.. It's ugly.
	 * jQuery Mobile uses this workaround. It's not ideal, but works.
	 *
	 * Modified to detect IE6
	 * ========================= */

	const supportsFixedPosition = (() => {
		const ua = navigator.userAgent;
		const platform = navigator.platform;
		// Rendering engine is Webkit, and capture major version
		const wkmatch = ua.match(/AppleWebKit\/([0-9]+)/);
		const wkversion = !!wkmatch && wkmatch[1];
		const ffmatch = ua.match(/Fennec\/([0-9]+)/);
		const ffversion = !!ffmatch && ffmatch[1];
		const operammobilematch = ua.match(/Opera Mobi\/([0-9]+)/);
		const omversion = !!operammobilematch && operammobilematch[1];
		const iematch = ua.match(/MSIE ([0-9]+)/);
		const ieversion = !!iematch && iematch[1];

		return !(
			// iOS 4.3 and older : Platform is iPhone/Pad/Touch and Webkit version is less than 534 (ios5)
			(
				((platform.indexOf("iPhone") > -1 ||
					platform.indexOf("iPad") > -1 ||
					platform.indexOf("iPod") > -1) &&
					wkversion &&
					wkversion < 534) ||
				// Opera Mini
				(window.operamini &&
					{}.toString.call(window.operamini) ===
						"[object OperaMini]") ||
				(operammobilematch && omversion < 7458) ||
				//Android lte 2.1: Platform is Android and Webkit version is less than 533 (Android 2.2)
				(ua.indexOf("Android") > -1 && wkversion && wkversion < 533) ||
				// Firefox Mobile before 6.0 -
				(ffversion && ffversion < 6) ||
				// WebOS less than 3
				("palmGetResource" in window && wkversion && wkversion < 534) ||
				// MeeGo
				(ua.indexOf("MeeGo") > -1 &&
					ua.indexOf("NokiaBrowser/8.5.0") > -1) ||
				// IE6
				(ieversion && ieversion <= 6)
			)
		);
	})();
})(jQuery, window);
