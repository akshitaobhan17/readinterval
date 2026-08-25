/* =========================================================
   THE INTERVAL — home page behaviour

   FORM_ENDPOINT: https://formspree.io/f/mvkpjwvr
   Free tiers handle hundreds of signups. Leave it empty and
   the form opens the visitor's mail app instead, which works
   but loses people — set it up before you launch.
========================================================= */
const FORM_ENDPOINT  = "";                      https://formspree.io/f/mvkpjwvr
const FALLBACK_EMAIL = "hello@readinterval.in";

/* ---------------- the hero puzzle ---------------- */
const ANSWER = "whatsapp group";
const clean  = s => s.toLowerCase().replace(/[^a-z]/g, "");
const TARGET = clean(ANSWER);

const input   = document.getElementById("answer");
const verdict = document.getElementById("verdict");
const clueEl  = document.getElementById("clue");
const giveup  = document.getElementById("giveup");
let solved = false;

function land(){
  solved = true;
  clueEl.textContent = "WHATSAPP GROUP";
  clueEl.style.textTransform = "uppercase";
  verdict.textContent = "That's the one. Muted since 2019.";
  verdict.className = "verdict";
  if (giveup) giveup.parentElement.style.display = "none";
  input.disabled = true;
  document.getElementById("check").textContent = "Solved";
}

function check(){
  if (solved) return;
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
  giveup.addEventListener("click", () => {
    land();
    verdict.textContent = "WhatsApp group. There are eighteen more inside.";
  });
}

/* ---------------- waitlist ---------------- */
const form = document.getElementById("signup");
const said = document.getElementById("said");

if (form){
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    if (!email || !email.includes("@")){
      said.textContent = "That address doesn't look finished.";
      return;
    }

    if (!FORM_ENDPOINT){
      window.location.href = "mailto:" + FALLBACK_EMAIL +
        "?subject=" + encodeURIComponent("Waitlist — Issue 01") +
        "&body=" + encodeURIComponent("Add me to the list: " + email);
      said.textContent = "Opening your mail app.";
      return;
    }

    said.textContent = "One moment.";
    try{
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Accept":"application/json" },
        body: JSON.stringify({ email, source:"home" })
      });
      if (!res.ok) throw new Error(res.status);
      said.textContent = "You're on the list. See you in September.";
      form.reset();
    } catch (err){
      said.textContent = "That didn't go through. Try again, or write to " + FALLBACK_EMAIL + ".";
    }
  });
}
