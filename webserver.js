const bodyParser = require('body-parser');
const cache = require("express-cache-response");
const compression = require('compression');
const engine = require('express-dot-engine');
const express = require('express');
const fs = require('fs');
const minify = require('express-minify');
const path = require('path');
const PORT = process.env.PORT || 3000;
const mongodb = require("mongodb");

const url = 'mongodb://155.246.39.17:27017/orbitalFederates';

let MongoClient = mongodb.MongoClient;

let app = express();

function startWebserver(db) {
    if (process.env.NODE_ENV === "production") {
        
        // Serve cached static responses to reduce overhead:
        app.use(cache());

        // Enables gzip compression:
        app.use(compression());

        // Set up minify:
        app.use(minify({
            cache: false // false means it caches in memory
        }));
    }

    app.engine('dot', engine.__express);
    app.set('views', path.join(__dirname, './views'));
    app.set('view engine', 'dot');

    // Gets a list of all files under folder including children of subfolders
    function walkSync(dir, prepend = "", fileList = []) {
        for (const file of fs.readdirSync(dir)) {
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                fileList = walkSync(path.join(dir, file), path.join(prepend, file), fileList);
            } else {
                fileList = fileList.concat(path.join(prepend, file));
            }
        }

        return fileList;
    }

    // Set up dot.js to translate link to page address
    if (fs.existsSync(path.join(__dirname, "./views"))) {
        walkSync(path.join(__dirname, "./views")).forEach((filePathOrig) => {
            // Files is an array of filename
            let filePath = filePathOrig.replace(/\.dot$/, ""); // Remove .dot at end of file names

            filePath = filePath.replace("\\", "/"); // Replace \ with /
            filePath = filePath.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"); // Escape regex operators in filePath
            filePath = filePath.replace(/(index)?$/, "($1(\.html)?)?"); // Make index and .html optional in the filePath
            let filePathRegex = new RegExp(`^\/${filePath}$`); // Set up regex matching for app get route

            // Set up route for each page
            app.get(filePathRegex, function (req, res, next) {
                res.render(filePathOrig);
            });
        });
    }
    // Serve static content:
    app.use(express.static(path.join(__dirname, "./public"), {
        extensions: ["html", "htm"]
    }));

    let error = "";

    function parseContext (state, line) {
        state.context = line;
    }

    function parseFind (state, line) {
        let query = {};
        // Split by OR
        let terms = line.split(/ or /i);
        let orList = [];
        // For every OR
        for (let i = 0; i < terms.length; ++i) {
            // Split by AND
            terms[i] = terms[i].trim();
            terms[i] = terms[i].split(/ and /i);
            let andList = [];
            // For every AND
            for (let j = 0; j < terms[i].length; ++j) {
                terms[i][j] = terms[i][j].trim();
                let matches = terms[i][j].match(/^(.+?)([>=<]+)(.+?)$/);
                if (matches.length !== 4) {
                    error = `Comparison statement not valid on Find: ${terms[i][j]}`;
                    return;
                }
                matches[1] = matches[1].trim();
                matches[2] = matches[2].trim();
                matches[3] = matches[3].trim();
                let oper = matches[2];
                switch(oper) {
                    case ">":
                        oper = "$gt";
                        break;
                    case "<":
                        oper = "$lt";
                        break;
                    case ">=":
                        oper = "$gte";
                        break;
                    case "<=":
                        oper = "$lte";
                        break;
                    case "=":
                        oper = "$eq";
                        break;
                    default:
                        error = `Equality operator not valid on Find: ${terms[i][j]}`;
                        return;
                }
                if (matches[1].includes("|len")) {
                    matches[1] = matches[1].slice(0,-4);
                    andList.push({[matches[1]]: {$size: {[oper]: matches[3]}}});
                } else {
                    andList.push({[matches[1]]: {[oper]: matches[3]}});
                }
            }
            if (andList.length === 1) {
                orList.push(andList[0]);
            } else {
                orList.push({$AND: andList});
            }
        }
        if (orList.length === 1) {
            query = orList[0];
        } else {
            query.$OR = orList;
        }
        state.result = query;

        return;
    }

    function parseLookup (state, line) {

    }

    function parseLine (line,error) {
        let state = {"context": "", "result": {}};
        lines = line.split("\n");
        for (var i = 0; i < lines.length; ++i) {
            let line = lines[i].split(":",2);
            let fn = line[0];
            if (line.length <= 1) {
                error = `No argument given on ${line}`;
                return "";
            }
            let arg = line[1];
            arg = arg.trim();
            switch(line[0].trim().toLowerCase()) {
                case "context":
                    parseContext(state, arg);
                    break;
                case "find":
                    parseFind(state, arg);
                    if (error) return "";
                    break;
                case "lookup":
                    parseLookup(state, arg);
                    break;
                default:
                    error = `No function given on ${line}`;
                    return error;
            }
        }
        return state.result;
    }

    app.post("/api/query", bodyParser.json(), function (req, res) {
        let result = parseLine(req.body.query);
        if (error) {
            res.send({Error: error});
        } else {
            res.send(result);
        }
        

        //res.send([[req.body.query],[req.body.query]]);        
        
        /*
        let collection = db.collection("designs");
        collection.find({}).toArray(function (err, result) {
            if (err) {
                console.log(err);
            } else if (result.length) {
                console.log('Found:', result);
                console.log(result);
                res.json(result);
            } else {
                console.log('No document(s) found with defined "find" criteria!');
                res.json("No results found...");
            }
        });
        */
        //res.json([{"this": "that"},{"this": "that again"}]);
    });

    app.listen(PORT, function () {
        console.log(`Example app listening on port ${PORT}`);
    })
}

MongoClient.connect(url, function (err, db) {
    if (err) {
        console.log('Unable to connect to the mongoDB server. Error:', err);
    } else {
        startWebserver(db);
    }
});