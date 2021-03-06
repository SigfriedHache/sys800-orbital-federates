"use strict";

// Submit with (Ctrl + Enter) when focus is on textarea
document.getElementById("federate-query").addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.keyCode == 13 || e.keyCode == 10)) {
        submitQuery();
    }
});

// Submit a POST to Webserver
function httpGetAsync(theUrl, callback) {
        
    let xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/query", true);
    xhr.setRequestHeader('Content-Type', 'application/JSON');
    xhr.onreadystatechange = function () {
        if (this.readyState != 4) return;
        if (this.status == 200) {
            callback(this.responseText);
        }
    };
    xhr.send(JSON.stringify({'query': theUrl}));
}

// Called when form is submitted
function submitQuery() {

    const federateQuery = document.getElementById('federate-query').value;

    document.getElementById("query-result").innerHTML = '<div class="progress"><div class="indeterminate "></div></div>';

    httpGetAsync(federateQuery, function(response){
        document.getElementById("query-result").innerHTML = JSON.stringify(JSON.parse(response),null,4);
    });
}