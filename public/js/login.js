//let username = document.getElementById('username');
//let password = document.getElementById('password');
//let Form = document.getElementById('form');

let username = $("#username");
let password = $("#password");
let Form = $("/");

//document.getElementById('login-button').onclick = alert('sdlfjsdlfj');

let button = document.getElementById("login-button");
button.addEventListener("click", function (e) {
  e.preventDefault();
  if (username.value.length === 0 || password.value.length === 0) {
    document.getElementById("message").innerHTML =
      "<h5>Username or Password is empty.</h5>";
  } else {
    Form.submit();
  }
});

// username.addEventListener("click", function(e) {
//   document.getElementById("message").innerHTML = "";
// });

// password.addEventListener("click", function(e) {
//   document.getElementById("message").innerHTML = "";
// });
