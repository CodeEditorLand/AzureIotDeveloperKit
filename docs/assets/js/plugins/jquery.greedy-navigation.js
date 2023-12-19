/*
GreedyNav.js - https://github.com/lukejacksonn/GreedyNav
Licensed under the MIT license - http://opensource.org/licenses/MIT
Copyright (c) 2015 Luke Jackson
*/

$(document).ready(() => {
	const $btn = $("nav.greedy-nav button");
	const $vlinks = $("nav.greedy-nav .visible-links");
	const $hlinks = $("nav.greedy-nav .hidden-links");

	let numOfItems = 0;
	let totalSpace = 0;
	const closingTime = 1000;
	const breakWidths = [];

	// Get initial state
	$vlinks.children().outerWidth((i, w) => {
		totalSpace += w;
		numOfItems += 1;
		breakWidths.push(totalSpace);
	});

	let availableSpace;
	let numOfVisibleItems;
	let requiredSpace;
	let timer;

	function check() {
		// Get instant state
		availableSpace = $vlinks.width() - 10;
		numOfVisibleItems = $vlinks.children().length;
		requiredSpace = breakWidths[numOfVisibleItems - 1];

		// There is not enough space
		if (window.innerWidth < 1024) {
			$vlinks.children().prependTo($hlinks);
			numOfVisibleItems = 0;
			// There is more than enough space
		} else {
			$hlinks.children().appendTo($vlinks);
			numOfVisibleItems = numOfItems;
		}
		// Update the button accordingly
		$btn.attr("count", numOfItems - numOfVisibleItems);
		if (numOfVisibleItems === numOfItems) {
			$btn.addClass("hidden");
		} else {
			$btn.removeClass("hidden");
		}
	}

	// Window listeners
	$(window).resize(() => {
		check();
	});

	$btn.on("click", function () {
		$hlinks.toggleClass("hidden");
		$(this).toggleClass("close");
		clearTimeout(timer);
	});

	$hlinks
		.on("mouseleave", () => {
			// Mouse has left, start the timer
			timer = setTimeout(() => {
				$hlinks.addClass("hidden");
			}, closingTime);
		})
		.on("mouseenter", () => {
			// Mouse is back, cancel the timer
			clearTimeout(timer);
		});

	check();
});
