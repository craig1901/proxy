//basic proxy server to forward browser requests to server and back if sites not in a blackList.json file.

var http = require('http');
var url = require('url');
var net = require('net');
var fs = require('fs');

var htmlFile, json, blackList;
var connectionData;
json = JSON.parse(fs.readFileSync('web_assets/data.json', 'utf-8'));
blackList = JSON.parse(fs.readFileSync('web_assets/blacklist.json', 'utf-8'));
console.log(blackList);
var server = http.createServer(function(request, response) {

//    console.log('request came in.')
    var b_url = url.parse(request.url, true);
    var options =  {
        host : b_url.hostname || '127.0.0.1',
        port : b_url.port || 80,
        path : b_url.path || "/",
        method : request.method,
        headers : request.headers
    };

    if(options.headers["cache-control"] != 'no-cache') {
        console.log("CACHE IT NOW");
        cacheHeaders(options.headers);
    }

    //console.log(options.host);
    // var s = blackList.sites[0].substring(4, blackList.sites[0].length);

    //if its not in the blackList, fetch it
    blackList = JSON.parse(fs.readFileSync('web_assets/blacklist.json', 'utf-8'));
    if(!isInBlackList(options.host, blackList.sites)) {
        var proxy_req = http.request(options, function(proxyRes) {
            connectionData = "connection established with http://" + options.host;
            json.messages.push(connectionData);
            //fs.writeFileSync('web_assets/data.json', JSON.stringify(json,null, 2));
            response.writeHead(proxyRes.statusCode, proxyRes.headers);
            //write the response from the server back to the browser
            proxyRes.on('data', function(chunk) {
                response.write(chunk);
            });
            proxyRes.on('end', function() {
                response.end();
                connectionData = "finished getting data from " + options.host;
                json.messages.push(connectionData);
                fs.writeFileSync('web_assets/data.json', JSON.stringify(json,null, 2));
            });
            proxyRes.on('error', function(err) {
                console.error(err);
            });

        }).end(); //end request
    }
    else {
        console.log("on blacklist you cant have it")
        htmlFile = fs.readFileSync('blacklist.html');
        response.writeHead(200, {'Content-Type' : 'text/html'});
        response.end(htmlFile);
    }

}).listen(8000, function() {
    console.log("listening for http on 8000");

});

cacheHeaders = function(headers) {
    var json = JSON.parse(fs.readFileSync('cachedHeaders.json', 'utf-8'));
    json.headers[json.headers.length] = headers;
    fs.writeFileSync('cachedHeaders.json', JSON.stringify(json, null, 2));
    console.log("CACHED!");
}

isInBlackList = function(url, blackList) {
    var s = url.substring(4, url.length);
    if(!url.includes("www.")){
        url = "www." + url;
    }
    // console.log("substring is " + s);
    // console.log("url is " + url);
    // console.log("blackList is " + blackList);
    for(var i = 0; i < blackList.length; i++) {
        if(url == blackList[i] || s == blackList[i]) {
            console.log("its in the blackList");
            return true;
        }
    }
    return false;
}
//catch the interrupt signal to delete all the written messages so old ones don't appear in the management console when we start the proxy back up
process.on('SIGINT', function() {
    console.log("Caught interrupt signal, removing data");
    json.messages = [];
    fs.writeFileSync('web_assets/data.json', JSON.stringify(json, null, 2));
    process.exit();
});

//listen to CONNECT requests(https)
server.on('connect', function(request, socket, head) {
    console.log(request.url);
    var host, port;
    var httpsReq = request.url.split(":");
    host = httpsReq[0];
    port = httpsReq[1];
    blackList = JSON.parse(fs.readFileSync('web_assets/blacklist.json', 'utf-8'));
    if(!isInBlackList(host, blackList.sites)) {
        console.log('proxying https for ' + host + ":" + port);
        var proxySocket = new net.Socket();
        if(host != '127.0.0.1') {
            console.log('connecting.....');
            proxySocket.connect(port, host, function() {
                console.log('socket connection established with ' + host + ":" + port);
                connectionData = "Secure socket connection with https://" + host;
                json.messages.push(connectionData);
                //write to file for management console to read from
                fs.writeFileSync('web_assets/data.json', JSON.stringify(json, null, 2));
                proxySocket.write(head);
                console.log("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n");
                socket.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n");
            });
            //pipe the data between the two sockets to forward proxy requests
            socket.pipe(proxySocket);
            proxySocket.pipe(socket);
        }
    }
    else {
        console.log("no chance");
        socket.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n");
        //didn't work so we don't get a fancy blackList message onto the https sites...
        socket.write("<h1>NO</h1>\r\n\r\n");
        socket.end();
    }
});
