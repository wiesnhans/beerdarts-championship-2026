export function initDropdown() {
  const dropdown = document.querySelector(".dropdown .dropbtn");
  const content = document.querySelector(".dropdown .dropdown-content");

  if (!dropdown) return; // falls noch nicht da

  dropdown.addEventListener("click", function(e) {
    e.preventDefault();
    content.style.display = content.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", function(e) {
    if (!dropdown.contains(e.target) && !content.contains(e.target)) {
      content.style.display = "none";
    }
  });
}