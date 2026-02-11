import { JSDOM } from "jsdom";

function xorshift32(seed: number) {
	let x = seed | 0;
	return () => {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		return (x >>> 0) / 4294967296;
	};
}

export async function setupHeadless({ seed }: { seed: number }) {
	const dom = new JSDOM("<!doctype html><html><body><div id='window'></div></body></html>", {
		url: "http://localhost/",
		pretendToBeVisual: true,
	});

	const w = dom.window as any;
	globalThis.window = w;
	globalThis.document = w.document;
	try {
		Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });
	} catch {
		// ignore
	}
	globalThis.HTMLElement = w.HTMLElement;
	globalThis.HTMLDivElement = w.HTMLDivElement;
	globalThis.HTMLSpanElement = w.HTMLSpanElement;
	globalThis.HTMLImageElement = w.HTMLImageElement;
	globalThis.HTMLAudioElement = w.HTMLAudioElement;
	globalThis.HTMLCanvasElement = w.HTMLCanvasElement;
	globalThis.MutationObserver = w.MutationObserver;
	globalThis.HTMLTableElement = w.HTMLTableElement;
	globalThis.HTMLTableRowElement = w.HTMLTableRowElement;
	globalThis.HTMLTableCellElement = w.HTMLTableCellElement;
	globalThis.HTMLInputElement = w.HTMLInputElement;
	globalThis.HTMLSelectElement = w.HTMLSelectElement;
	globalThis.HTMLStyleElement = w.HTMLStyleElement;
	globalThis.HTMLLinkElement = w.HTMLLinkElement;
	globalThis.Element = w.Element;
	globalThis.Node = w.Node;
	globalThis.localStorage = w.localStorage;
	globalThis.location = w.location;
	try {
		Object.defineProperty(w.location, "reload", { value: () => {}, configurable: true });
	} catch {}
	try {
		Object.defineProperty(w.Location.prototype, "reload", { value: () => {}, configurable: true });
	} catch {}
	globalThis.XMLHttpRequest = w.XMLHttpRequest;
	globalThis.Blob = w.Blob;
	globalThis.FileReader = w.FileReader;
	const safeAtob = (input: string) => {
		try {
			return w.atob(input);
		} catch {
			return "";
		}
	};
	globalThis.atob = safeAtob;
	globalThis.btoa = w.btoa;
	if (!(Promise as any).try) {
		// @ts-expect-error ignore
		Promise.try = (fn: Function) =>
			new Promise((resolve, reject) => {
				try {
					resolve(fn());
				} catch (e) {
					reject(e);
				}
			});
	}

	try {
		await import("fake-indexeddb/auto");
	} catch (e) {
		console.warn("[headless] fake-indexeddb not installed; indexedDB unavailable.");
	}
	if (!globalThis.indexedDB) {
		// @ts-expect-error ignore
		globalThis.indexedDB = w.indexedDB;
	}
	if (!globalThis.indexedDB) {
		try {
			const fidb = await import("fake-indexeddb");
			// @ts-expect-error ignore
			globalThis.indexedDB = fidb.indexedDB;
			// @ts-expect-error ignore
			globalThis.IDBKeyRange = fidb.IDBKeyRange;
		} catch {}
	}

	globalThis.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 0) as any;
	globalThis.cancelAnimationFrame = (id: any) => clearTimeout(id);
	try {
		// @ts-expect-error ignore
		if (!globalThis.HTMLCanvasElement.prototype.getContext) {
			// @ts-expect-error ignore
			globalThis.HTMLCanvasElement.prototype.getContext = () => ({});
		}
	} catch {}

	globalThis.confirm = () => true;
	globalThis.alert = () => {};
	globalThis.prompt = () => null;

	localStorage.setItem("noname_inited", "nodejs");
	localStorage.setItem("gplv3_noname_alerted", "true");
	localStorage.setItem("show_splash_off", "true");
	try {
		Object.defineProperty(w.document, "readyState", { get: () => "complete" });
		setTimeout(() => w.dispatchEvent(new w.Event("load")), 0);
	} catch {}

	const rng = xorshift32(seed);
	Math.random = rng;

	return dom;
}
