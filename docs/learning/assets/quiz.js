// Multiple-choice quizzes. Markup:
//
//   <div class="quiz" data-answer="2" data-why="Why the right answer is right.">
//     <div class="label">Quiz</div>
//     <p class="q">Question?</p>
//     <ol class="opts"><li>…</li><li>…</li></ol>
//     <p class="fb"></p>
//   </div>
//
// data-answer is 0-based. Each <li> may carry data-why: feedback for picking that wrong option.
(function () {
  for (const quiz of document.querySelectorAll(".quiz")) {
    const answer = Number(quiz.dataset.answer);
    const fb = quiz.querySelector(".fb");
    const items = [...quiz.querySelectorAll(".opts li")];
    items.forEach((li, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "opt";
      btn.innerHTML = li.innerHTML;
      li.replaceChildren(btn);
      btn.addEventListener("click", () => {
        quiz.querySelectorAll("button.opt").forEach((b) => b.classList.remove("right", "wrong"));
        if (i === answer) {
          btn.classList.add("right");
          fb.innerHTML = `<strong>Correct.</strong> ${quiz.dataset.why || ""}`;
        } else {
          btn.classList.add("wrong");
          fb.innerHTML = `<strong>Not this one.</strong> ${li.dataset.why || "Look at the picture again, then try a different answer."}`;
        }
      });
    });
  }
})();
