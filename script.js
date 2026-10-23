const region = document.getElementById("region");

region.onchange = () => {
	loadRegion(region.value.toLowerCase());
	region.blur();
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let world;
let map = {
	"rooms": [],
	"connections": [],
};
let chosenRoom;
let STOP_UPDATE = false;

function loadRegion(REGION_ACRONYM) {
	world = null;
	map = {
		"rooms": [],
		"connections": [],
	};
	chosenRoom = null;
	STOP_UPDATE = true;
	drawType = 1;
	revealed = false;
	score = 0;

	fetch(`./data/world/${REGION_ACRONYM}/world_${REGION_ACRONYM}.txt`).then(x => x.text()).then(data => {
		dataGet(data);
	});

	fetch(`./data/world/${REGION_ACRONYM}/map_${REGION_ACRONYM}.txt`).then(x => x.text()).then(data => {
		for (let line of data.split("\n")) {
			if (!line)
				continue;

			if (line.startsWith("Connection: ")) {
				let c = line.substring(line.indexOf(": ") + 2).split(",");
				map.connections.push({
					"a": c[0],
					"b": c[1],
					"aX": +c[2],
					"aY": +c[3],
					"bX": +c[4],
					"bY": +c[5],
				});
			}
			else {
				let id = line.substring(0, line.indexOf(":"));
				if (id.toLowerCase().startsWith("offscreen"))
					continue;

				let r = line.substring(line.indexOf(": ") + 2).split("><");
				console.log(id + " " + +r[2] + " " + +r[3]);
				map.rooms.push({
					"id": id,
					"canonX": +r[0],
					"canonY": +r[1],
					"devX": (+r[2]) / 2,
					"devY": (+r[3]) / 2,
					"layer": +r[4] ?? 0,
					"subregion": r[5],
				});
			}
		}
		for (let room of map.rooms) {
			toFetch++;
			let path = `./data/world/${REGION_ACRONYM}-rooms/${room.id.toLowerCase()}.txt`;
			if (room.id.toLowerCase().startsWith("gate")) {
				path = `./data/world/gates/${room.id.toLowerCase()}.txt`;
			}
			fetch(path).then(x => x.text()).then(data => {
				data = data.split("\n");

				let [x, y] = data[1].split("|")[0].split("*");
				room.width = +x;
				room.height = +y;
				room.data = data[11].split("|").map(x => (x.split(",")[0] == "0") ? 0 : 1);
				room.data.splice(room.data.length - 1, 1);

				toFetch--;
				dataGet();
			});
		}
		dataGet(null, data);
	});
}

let toFetch = 0;
function dataGet(_world, _map) {
	world ??= _world;
	map ??= _map;
	console.log("Called " + toFetch);
	if (world != null && map.rooms.length != 0 && toFetch == 0) {
		console.log("Loaded!");
		lastUpdate = Date.now();
		let left = Infinity;
		let right = -Infinity;
		let top = Infinity;
		let bottom = -Infinity;
		for (let room of map.rooms) {
			left = Math.min(left, room.devX);
			right = Math.max(right, room.devX + room.width);
			top = Math.min(top, -room.devY);
			bottom = Math.max(bottom, -room.devY - room.height);
		}
		console.log(left + " " + right + " " + top + " " + bottom);

		let mapWidth = right - left;
		let mapHeight = bottom - top;
		cameraX = left + mapWidth / 2;
		cameraY = top + mapHeight / 2;
		let padding = 0.99;
		let zoomX = (window.innerWidth * padding) / mapWidth;
		let zoomY = (window.innerHeight * padding) / mapHeight;
		cameraZoom = Math.min(zoomX, zoomY);
		chosenRoom = map.rooms[Math.floor(Math.random() * map.rooms.length)];
		chosenRoom.oData = [...chosenRoom.data];
		for (let i = 0; i < chosenRoom.data.length; i++) {
			chosenRoom.data[i] = 0;
		}
		STOP_UPDATE = false;
		draw();
	}
}

let t = 0;
let lastUpdate;
const FRAME = 1000.0 / 60.0;
function draw() {
	if (STOP_UPDATE) {
		STOP_UPDATE = false;
		return;
	}

	requestAnimationFrame(draw);

	let now = Date.now();
	while (now - lastUpdate > FRAME) {
		update();
		lastUpdate += FRAME;
	}
}

let keys = {};
document.addEventListener("keydown", e => {
	keys[e.code] = true;
});
document.addEventListener("keyup", e => {
	delete keys[e.code];
});

function calculateGridSimilarity(oData, tData, width, height) {
	let totalSolidO = 0;
	let totalSolidT = 0;
	for (let i = 0; i < oData.length; i++) {
		if (oData[i] === 1) totalSolidO++;
		if (tData[i] === 1) totalSolidT++;
	}

	if (totalSolidO === 0 && totalSolidT === 0) return 1.0;
	if (totalSolidO === 0 || totalSolidT === 0) return 0.0;

	const MAX_SHIFT = 3;
	let maxScore = 0;

	for (let shiftX = -MAX_SHIFT; shiftX <= MAX_SHIFT; shiftX++) {
		for (let shiftY = -MAX_SHIFT; shiftY <= MAX_SHIFT; shiftY++) {
			let correctAir = 0;
			let correctSolid = 0;

			for (let x = 0; x < width; x++) {
				let targetX = x + shiftX;
				if (targetX < 0 || targetX >= width) continue;

				for (let y = 0; y < height; y++) {
					let targetY = y + shiftY;
					if (targetY < 0 || targetY >= height) continue;

					let indexA = x * height + y;
					let indexB = targetX * height + targetY;

					if (oData[indexA] === 1 && tData[indexB] === 1) {
						correctSolid++;
					}
					if (oData[indexA] === 0 && tData[indexB] === 0) {
						correctAir++;
					}
				}
			}

			let airPercent = correctAir / (width * height - totalSolidO);
			let solidPercent = correctSolid / totalSolidO;
			let ratio = totalSolidO / (width * height)
			let score = airPercent * (ratio + solidPercent * 1 - ratio);

			if (score > maxScore) {
				maxScore = score;
			}
		}
	}

	return maxScore;
}


let cameraX = 0.0;
let cameraY = 0.0;
let cameraZoom = 1.0;
let cameraMoveSpeed = 8.0;
let drawType = 1;
let revealed = false;
let score;
function update() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	if ("ArrowLeft" in keys) cameraX -= cameraMoveSpeed / cameraZoom;
	if ("ArrowRight" in keys) cameraX += cameraMoveSpeed / cameraZoom;
	if ("ArrowUp" in keys) cameraY -= cameraMoveSpeed / cameraZoom;
	if ("ArrowDown" in keys) cameraY += cameraMoveSpeed / cameraZoom;
	if ("KeyZ" in keys) cameraZoom *= 1.025;
	if ("KeyX" in keys) cameraZoom /= 1.025;
	if ("Digit1" in keys) drawType = 0;
	if ("Digit2" in keys) drawType = 1;
	if ("KeyT" in keys && !revealed) {
		score = calculateGridSimilarity(chosenRoom.oData, chosenRoom.data, chosenRoom.width, chosenRoom.height) * 100;
		revealed = true;
	}
	if ("Space" in keys) {
		for (let room of map.rooms) {
			if (room != chosenRoom)
				continue;

			const left = room.devX;
			const right = room.devX + room.width;
			const top = -room.devY - room.height;
			const bottom = -room.devY;

			if (cameraX >= left && cameraX <= right && cameraY >= top && cameraY <= bottom) {
				const x = Math.floor(cameraX - left);
				const y = Math.floor(cameraY - top);
				room.data[x * room.height + y] = drawType;
				break;
			}
		}
	}
	if ("KeyQ" in keys) {
		for (let room of map.rooms) {
			if (room != chosenRoom)
				continue;

			const left = room.devX;
			const right = room.devX + room.width;
			const top = -room.devY - room.height;
			const bottom = -room.devY;

			if (cameraX >= left && cameraX <= right && cameraY >= top && cameraY <= bottom) {
				const startX = Math.floor(cameraX - left);
				const startY = Math.floor(cameraY - top);

				const targetColor = 1 - drawType;
				const replacementColor = drawType;

				const startIndex = startX * room.height + startY;

				if (room.data[startIndex] == targetColor) {
					const queue = [[startX, startY]];

					while (queue.length > 0) {
						const [cx, cy] = queue.shift();
						const index = cx * room.height + cy;
						room.data[index] = replacementColor;

						const neighbors = [
							[cx + 1, cy],
							[cx - 1, cy],
							[cx, cy + 1],
							[cx, cy - 1]
						];

						for (const [nx, ny] of neighbors) {
							if (nx >= 0 && nx < room.width && ny >= 0 && ny < room.height) {
								const neighborIndex = nx * room.height + ny;

								if (room.data[neighborIndex] == targetColor) {
									room.data[neighborIndex] = replacementColor;
									queue.push([nx, ny]);
								}
							}
						}
					}
				}
				break;
			}
		}
	}


	ctx.save();

	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.scale(cameraZoom, cameraZoom);
	ctx.translate(-cameraX, -cameraY);

	t += 1;
	ctx.lineJoin = "round";
	for (let room of map.rooms) {
		ctx.beginPath();
		ctx.fillStyle = "#747474";
		ctx.rect(room.devX, -room.devY, room.width, -room.height);
		ctx.fill();

		ctx.fillStyle = "#303030";
		ctx.beginPath();
		for (let x = 0; x < room.width; x++) {
			for (let y = 0; y < room.height; y++) {
				if (room.data[x * room.height + y] > 0)
					ctx.rect(room.devX + x, -room.devY - room.height + y + 1, 1, -1);
			}
		}
		ctx.fill();

		if (room == chosenRoom && revealed) {
			for (let x = 0; x < room.width; x++) {
				for (let y = 0; y < room.height; y++) {
					const index = x * room.height + y;

					const isOriginalFilled = room.oData[index] > 0;
					const isUserFilled = room.data[index] > 0;

					let fillColor = null;

					if (isOriginalFilled && isUserFilled) {
						fillColor = "#00ff66a4";
					} else if (!isOriginalFilled && isUserFilled) {
						fillColor = "#ff3333a4";
					} else if (isOriginalFilled && !isUserFilled) {
						fillColor = "#00e1ffa4";
					} else {
						fillColor = "#99ff99a4";
					}

					if (fillColor) {
						ctx.beginPath();
						ctx.fillStyle = fillColor;
						ctx.rect(room.devX + x, -room.devY - room.height + y + 1, 1, -1);
						ctx.fill();
					}
				}
			}
			ctx.beginPath();
			ctx.fillStyle = "green";
			ctx.textAlign = "center";
			ctx.font = (64 / cameraZoom) + "px monospace";
			ctx.fillText(score.toFixed(2), room.devX + room.width * 0.5, -room.devY + 64 / cameraZoom);
		}

		ctx.beginPath();
		ctx.strokeStyle = (room == chosenRoom) ? "red" : "#bababa";
		ctx.lineWidth = (room == chosenRoom) ? (8.0 / cameraZoom) : 0.5;
		ctx.fillStyle = "#747474";
		ctx.rect(room.devX, -room.devY, room.width, -room.height);
		ctx.stroke();
	}
	ctx.strokeStyle = "#ffffffba";
	for (let conn of map.connections) {
		ctx.beginPath();
		let a = map.rooms.find(r => r.id.toLowerCase() == conn.a.toLowerCase());
		let b = map.rooms.find(r => r.id.toLowerCase() == conn.b.toLowerCase());
		ctx.moveTo(a.devX + conn.aX + 0.5, -a.devY - conn.aY - 0.5);
		ctx.lineTo(b.devX + conn.bX + 0.5, -b.devY - conn.bY - 0.5);
		ctx.stroke();
	}

	ctx.restore();

	ctx.fillStyle = "white";
	ctx.beginPath();
	ctx.arc(canvas.width / 2, canvas.height / 2, 2.0, 0, Math.PI * 2.0);
	ctx.fill();
}

region.selectedIndex = Math.floor(Math.random() * region.options.length);
region.dispatchEvent(new Event("change"));