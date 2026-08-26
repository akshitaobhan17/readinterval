/* THE INTERVAL — home page behaviour */
const ANSWER = "whatsapp group";
const clean = s => s.toLowerCase().replace(/[^a-z]/g, "");
const TARGET = clean(ANSWER);

const input = document.getElementById("answer");
const verdict = document.getElementById("verdict");
const clueEl = document.getElementById("clue");
const giveup = document.getElementById("giveup");
let solved = false;

function land(){
  solved = true;
  if (clueEl) {
    clueEl.textContent = "WHATSAPP GROUP";
    clueEl.style.textTransform = "uppercase";
  }
  if (verdict) {
    verdict.textContent = "That's the one. Muted since 2019.";
    verdict.className = "verdict";
  }
  if (giveup) giveup.parentElement.style.display = "none";
  if (input) input.disabled = true;
  const checkButton = document.getElementById("check");
  if (checkButton) checkButton.textContent = "Solved";
}

function check(){
  if (solved || !input) return;
  const g = clean(input.value);
  if (!g){
    verdict.textContent = "Say it out loud first. It helps.";
    verdict.className = "verdict";
    return;
  }
  if (g === TARGET){ land(); return; }
  if (g.includes("whatsapp") || g.includes("watsapp")){
    verdict.textContent = "Halfway. Keep going — what kind?";
    verdict.className = "verdict near";
  } else if (g.includes("group")){
    verdict.textContent = "Right ending, wrong beginning.";
    verdict.className = "verdict near";
  } else {
    verdict.textContent = "Not it. Try saying it faster.";
    verdict.className = "verdict";
  }
}

if (input){
  document.getElementById("check").addEventListener("click", check);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); check(); }
  });
}
if (giveup){
  giveup.addEventListener("click", () => {
    land();
    if (verdict) verdict.textContent = "WhatsApp group. There are eighteen more inside.";
  });
}
