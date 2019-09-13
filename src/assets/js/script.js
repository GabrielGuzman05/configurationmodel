var x2js = new X2JS();
var sizeSVG = '';
var info = '';
var instances;
var ors = [];
var xors = [];
var svgPrint = document.getElementById('svgcanvas');
var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('xlink', 'http://www.w3.org/1999/xlink');

var openFile = function(event) {
    var input = event.target;
    var reader = new FileReader();
    reader.onload = function(){
        text = reader.result;
        $("#xmlArea").val(text);
    }
    reader.readAsText(input.files[0]);
}

function svgSize(obj) {
    //Tamaño XML
    sizeSVG = obj.ADOXML.MODELS.MODEL.MODELATTRIBUTES.ATTRIBUTE[16].__text;
    sizeSVG = sizeSVG.split("C ");
    sizeSVG = sizeSVG[1].split("TABLE");
    info = "Tamaño modelo: " + sizeSVG[0] + "Instances: ";
    svg = buildsvg("x:1 y:1 w:30 h:20 scale:1");
    svgPrint.innerHTML = "";
}

function configurarInstancias(instancias) {
    instances = new Array(instancias.length);
    for (var i = 0; i < instancias.length; i++) {
        instances[i] = new Array(6);
        instances[i][0] = instancias[i]._name;
        
        var posicion = instancias[i].ATTRIBUTE[0].__text;
        
        posicion = posicion.split("E ");
        posicion = posicion[1].split("index");
        instances[i][1] = posicion[0];
        
        //Relaciones require y exclude
        instances[i][5] = [];

        svg.appendChild(instancesvg(instances[i][1], instances[i][0]));
    }
}

function dibujarMandatoryOrOptional(instancia, color) {
    svg.appendChild(linemo(instancia[4], instancia[1], instancia[2]));
    svg.appendChild(circle(instancia[1], color));
}

function dibujarOrXor(instancia, or) {
    svg.appendChild(linemo(instancia[4], instancia[1], instancia[2]));
    var orxor = new Array();
    orxor[0] = instancia[3];
    orxor[1] = instancia[4];
    orxor[2] = instancia[0];
    orxor[3] = instancia[1];

    if (or === 0) {
        orxor[4] = 'white';
    } else {
        orxor[4] = 'black';
    }

    orxor[5] = false;
    ors.push(orxor);
}

function dibujarRequire(conector, instancia, indice) {
    let edges = conector[indice].ATTRIBUTE.__text.split("x");
    if (edges.length <= 2) {
        svg.appendChild(linerequire(instancia[4], instancia[1], 2));
    } else {
        for (let i = 1; i < edges.length; i++) {
            if (i === 1) {
                svg.appendChild(linerequire(instancia[4], edges[i], 1));
            } else if (i === edges.length - 1) {
                svg.appendChild(linerequire(edges[i - 1], instancia[1], 2));
            } else {
                var pos = i - 1;
                svg.appendChild(linerequire(edges[pos], edges[i], 0));
            }
        }
    }
}

function dibujarExclude(conector, instancia, indice) {
    let edges = conector[indice].ATTRIBUTE.__text.split("x");
    if (edges.length <= 2) {
        svg.appendChild(linexclude(instancia[4], instancia[1], 3));
    } else {
        for (let i = 1; i < edges.length; i++) {
            if (i === 1) {
                svg.appendChild(linexclude(instancia[4], edges[i], 1));
            } else if (i === edges.length - 1) {
                svg.appendChild(linexclude(edges[i - 1], instancia[1], 2));
            } else {
                var pos = i - 1;
                svg.appendChild(linexclude(edges[pos], edges[i], 0));
            }
        }
    }
}

function agregarConectores(conectores) {
    for (var i = 0; i < conectores.length; i++) {
        for (var j = 0; j < instances.length; j++) {
            var comparet = instances[j][0].localeCompare(conectores[i].TO._instance);
            if (comparet === 0) {
                var original = false;
                var clase;
                var instancia;
                var medidas;

                //En caso de existir y no ser Requires o Excludes, se conservan los datos originales
                //para volver a reasignar luego
                if (instances[j][2] !== null && instances[j][3] && instances[j][4] !== null &&
                    instances[j][2] !== 'Requires' && instances[j][2] !== 'Excludes') {
                    original = true;
                    clase = instances[j][2];
                    instancia = instances[j][3];
                    medidas = instances[j][4];
                }

                instances[j][2] = conectores[i]._class;
                instances[j][3] = conectores[i].FROM._instance;

                for (var k = 0; k < instances.length; k++) {
                    var comparef = instances[k][0].localeCompare(instances[j][3]);
                    if (comparef === 0) {
                        instances[j][4] = instances[k][1];
                        
                        var optional = instances[j][2].localeCompare("Optional");
                        var mandatory = instances[j][2].localeCompare("Mandatory");
                        var xor = instances[j][2].localeCompare("XOR");
                        var or = instances[j][2].localeCompare("OR");
                        var require = instances[j][2].localeCompare("Requires");
                        var exclude = instances[j][2].localeCompare("Excludes");

                        if (mandatory === 0) {
                            dibujarMandatoryOrOptional(instances[j], 'black');
                        }

                        if (optional === 0) {
                            dibujarMandatoryOrOptional(instances[j], 'white');
                        }

                        if (or === 0 || xor === 0) {
                            dibujarOrXor(instances[j], or);
                        }

                        if (require === 0) {
                            instances[j][5].push([instances[j][2], instances[j][3], instances[j][4]]);
                            dibujarRequire(conectores, instances[j], i);
                        }

                        if (exclude === 0) {
                            instances[j][5].push([instances[j][2], instances[j][3], instances[j][4]]);
                            dibujarExclude(conectores, instances[j], i);
                        }
                    }
                }

                //En caso de existir, volver al los atributos que no son require ni exclude
                if (original) {
                    instances[j][2] = clase;
                    instances[j][3] = instancia;
                    instances[j][4] = medidas;
                }
                
                info += instances[j][0] + " p: " + instances[j][1] + " t: " + instances[j][2] + " f: " + instances[j][3] + "p2: " + instances[j][4] + " /// ";
            }
        }
    }
}

function agregarOrs() {
    var cont = 0;
    for (var i = 0; i < ors.length; i++) {
        if (ors[i][5] === false) {
            var poligono = new Array();
            var pos = ors[i][1].split(":");
            let x = 55 * parseInt(pos[1].split("cm"));
            let y = 55 * parseInt(pos[2].split("cm"));
            poligono[0] = x;
            poligono[1] = y;
            poligono[2] = 0;
            poligono[3] = 0;
            poligono[4] = 0;
            poligono[5] = 0;
            poligono[6] = ors[i][4];
            ors[i][5] = true;
            var firstElement = false;

            for (var j = 0; j < ors.length; j++) {
                if (ors[j][5] === false || j <= 20000) {
                    var flag = ors[i][0].localeCompare(ors[j][0]);
                    if (flag === 0) {
                        ors[j][5] = true;
                        var post = ors[j][3].split(":");
                        let x1 = 55 * parseInt(post[1].split("cm"));
                        let y1 = 55 * parseInt(post[2].split("cm"));
                        
                        if (firstElement) {
                            if (poligono[3] > y1) {
                                poligono[3] = y1;
                            }

                            if (poligono[5] < y1) {
                                poligono[5] = y1;
                            
                            }
                            if (poligono[2] > x1) {
                                poligono[2] = x1;
                            }

                            if (poligono[4] < x1) {
                                poligono[4] = x1;
                            }
                        } else {
                            poligono[2] = x1;
                            poligono[3] = y1;
                            poligono[4] = x1;
                            poligono[5] = y1;
                            poligono[6] = ors[i][4];
                            firstElement = true;
                        }
                    }
                }
                if (j === (ors.length - 1)) {
                    cont++;
                    xors.push(poligono);
                }
            }

        }
    }
}

function buildJson() {
    $("#jsonArea2").val("Cargando...");
    var xml = JSON.stringify(x2js.xml_str2json($("#xmlArea").val()));
    var obj = JSON.parse(xml);
    $("#jsonArea").val(xml);

    svgSize(obj);
    configurarInstancias(obj.ADOXML.MODELS.MODEL.INSTANCE);
    agregarConectores(obj.ADOXML.MODELS.MODEL.CONNECTOR);
    agregarOrs();

    for (var i = 0; i < xors.length; i++) {
        svg.appendChild(orxorsvg(xors[i]));
    }

    svgPrint.appendChild(svg);
    $("#jsonArea2").val(info);
    localStorage.setItem('datos', JSON.stringify(instances));
}