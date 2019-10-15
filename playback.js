var x = prompt("Speed?");

if (x != "") {
    document.getElementsByTagName("video")[0].playbackRate = x;
}