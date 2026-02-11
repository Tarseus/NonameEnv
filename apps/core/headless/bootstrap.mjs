import { JSDOM } from "jsdom";

export async function setupHeadlessGlobals() {
	const root = new URL("../", import.meta.url);
	const dom = new JSDOM("<!doctype html><html><body><div id=window></div></body></html>", {
		url: root.href,
		pretendToBeVisual: true,
		runScripts: "dangerously",
		resources: "usable",
	});

	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.navigator = dom.window.navigator;
	globalThis.location = dom.window.location;
	globalThis.self = dom.window;
	globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
	globalThis.Blob = dom.window.Blob;
	globalThis.FileReader = dom.window.FileReader;
	globalThis.atob = dom.window.atob;
	globalThis.btoa = dom.window.btoa;
	globalThis.performance = dom.window.performance;

	// Ensure util/index.js uses nodejs branch.
	window.localStorage.setItem("noname_inited", "nodejs");
	globalThis.localStorage = window.localStorage;

	try {
		await import("fake-indexeddb/auto");
	} catch (e) {
		console.warn("[headless] fake-indexeddb not installed; indexedDB unavailable.");
	}

	globalThis.alert = () => {};
	globalThis.confirm = () => true;
	globalThis.prompt = () => null;

	globalThis.Image = class {
		set src(_) {}
	};
	globalThis.Audio = class {
		play() {}
		pause() {}
	};
	globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
	globalThis.cancelAnimationFrame = id => clearTimeout(id);

	return dom;
}

export function patchHeadlessUI({ ui, game }) {
	const makeDiv = id => {
		const node = document.createElement("div");
		if (id) node.id = id;
		node.show = () => {
			node.style.display = "";
		};
		node.hide = () => {
			node.style.display = "none";
		};
		return node;
	};

	ui.update = () => {};
	ui.refresh = () => {};
	ui.updatec = () => {};
	ui.updatex = () => {};
	ui.updatez = () => {};
	ui.updated = () => {};
	ui.updatehl = () => {};
	ui.updateh = () => {};
	ui.updatej = () => {};
	ui.updatem = () => {};
	ui.updatePlayerPositions = () => {};
	ui.updateConnectPlayerPositions = () => {};

	ui.create.dialog = () => {
		const node = makeDiv();
		const contentContainer = makeDiv();
		const content = makeDiv();
		contentContainer.appendChild(content);
		node.appendChild(contentContainer);
		node.content = content;
		node.contentContainer = contentContainer;
		node.buttons = [];
		node.open = () => {};
		node.close = () => {};
		node.add = html => {
			const child = document.createElement("div");
			if (typeof html === "string") {
				child.innerHTML = html;
			}
			content.appendChild(child);
			return child;
		};
		node.delete = () => node.remove();
		return node;
	};

	ui.create.control = () => {
		const node = makeDiv();
		node.close = () => {};
		node.delete = () => node.remove();
		node.replace = () => {};
		return node;
	};

	ui.create.arena = () => {
		ui.window = document.getElementById("window") || document.body;

		ui.arena = makeDiv("arena");
		ui.arena.id = "arena";
		ui.window.appendChild(ui.arena);

		ui.control = makeDiv("control");
		ui.control.id = "control";
		ui.control.show = () => {};
		ui.control.hide = () => {};
		ui.arena.appendChild(ui.control);

		ui.cardPile = makeDiv("cardPile");
		ui.cardPile.id = "cardPile";
		ui.arena.appendChild(ui.cardPile);

		ui.discardPile = makeDiv("discardPile");
		ui.discardPile.id = "discardPile";
		ui.arena.appendChild(ui.discardPile);

		ui.playerids = makeDiv("playerids");
		ui.playerids.id = "playerids";
		ui.arena.appendChild(ui.playerids);

		ui.me = makeDiv("me");
		ui.mebg = makeDiv("mebg");
		ui.autonode = makeDiv("autonode");
		ui.historybar = makeDiv("historybar");
		ui.pause = makeDiv("pausebutton");

		ui.selected = { cards: [], targets: [], buttons: [] };
	};

	game.addVideo = () => {};
	game.playAudio = () => {};
	game.playVideo = () => {};

	game.delay = async () => {};
	game.delayx = async () => {};
}

export function installPauseBridge({ game, get, _status }) {
	let resolver = null;
	const waitDecision = () => new Promise(r => (resolver = r));

	const origPause = game.pause.bind(game);
	game.pause = function () {
		origPause();
		const evt = get.event();
		if (resolver) resolver(evt);
		return _status.pauseManager.pause;
	};

	return { waitDecision };
}
