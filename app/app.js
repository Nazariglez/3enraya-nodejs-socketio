var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    sanitizer = require('sanitizer'),
    io = require('socket.io').listen(server, {
        'log level' : 2
    });

server.listen(3001);

app.use(express.static(__dirname + '/public'));

app.get('/public', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});

var usuarios = [], //Array con los nombres de usuarios.
    jugadores = [], //Array con los nombres de los jugadores
    tablero = ['','','','','','','','',''], //Estado del tablero
    turno = false, //Indica el jugador al que le toca jugar
    jugadas = 0; //Contador de jugadas para saber cuando declarar empate.

//Devuelve la figura del jugador.
var figura = function( jugador ){
    var figuras = ['X','O'];
    return figuras[jugador-1];
};

//Se comprueban todas las jugadas posibles
var comprobarTablero = function( tablero ){

    var r = false, t = tablero;

    if( (t[0] == t[1]) && (t[0] == t[2]) && (t[0] !== '') ){ //Primera fila
        r = true;
    }else if( (t[3] == t[4]) && (t[3] == t[5]) && (t[3] !== '') ){ //Segunda fila
        r = true;
    }else if( (t[6] == t[7]) && (t[6] == t[8]) && (t[6] !== '') ){ //Tercera fila
        r = true;
    }else if( (t[0] == t[3]) && (t[0] == t[6]) && (t[0] !== '') ){ //Primera columna
        r = true;
    }else if( (t[1] == t[4]) && (t[1] == t[7]) && (t[1] !== '') ){ //Segunda columna
        r = true;
    }else if( (t[2] == t[5]) && (t[2] == t[8]) && (t[2] !== '') ){ //tercera columna
        r = true;
    }else if( (t[0] == t[4]) && (t[0] == t[8]) && (t[0] !== '') ){ //Primera diagonal
        r = true;
    }else if( (t[6] == t[4]) && (t[6] == t[2]) && (t[6] !== '') ){ //Segunda diagonal
        r = true;
    }

    return r;

};

//Al conectarse un usuario
io.sockets.on('connection', function (socket) {

    var desconectarAmbosJugadores = function(){
        jugadores = [];
        tablero = ['','','','','','','','',''];
        turno = false;
        jugadas = 0;
        io.sockets.emit('desconectarAmbosJugadores', true);

        //Recorremos todos los sockets abiertos y eliminamos el tag de jugador
        for(var i in io.sockets.sockets){

            if(io.sockets.sockets[i].jugador){
                delete io.sockets.sockets[i].jugador;
            }
        }
    };

    //Enviamos al usuarios los datos que debe ver en pantalla al entrar, como estado del tablero y jugadores
    socket.emit('conexion', {'jugadores' : jugadores, 'tablero' : tablero});

    //Devolvemos el ping con los milisegundos al cliente para que pueda calcular la latencia.
    socket.on('ping', function(data, callback){
        if(callback && typeof callback == 'function'){
            callback(data);
        }
    });

    //Al enviar el nombre de un nuevo usuario lo comprobamos.
    socket.on('comprobarUsuario',function(data, callback){

        data = sanitizer.escape(data);

        //Comprobamos que el nombre no esta en uso, o contiene caracteres raros.
        if(usuarios.indexOf(data) >= 0){
            callback({ok : false, msg : 'Este nombre esta ocupado'});
        }else{

            //Enviamos su nick comprobado al usuario.
            callback({ok : true, nick : data});
            socket.nick = data;
            usuarios.push(data);
            console.log('Usuario conectado: ' + socket.nick);

            //Enviamos a todos los usuarios que se ha unido uno nuevo.
            io.sockets.emit('nuevoUsuario', {nick : data, listaUsuarios : usuarios});
        }

    });

    //Recibimos la petición de nuevo jugador y enviamos respuesta
    socket.on('nuevoJugador', function(data, callback){

        if(jugadores.length < 2 && !socket.jugador ){
            jugadores.push(socket.nick);
            callback({ok : true, 'jugador' : jugadores.length});
            socket.jugador = jugadores.length;
            io.sockets.emit('nuevoJugador', {nick : socket.nick, 'jugador' : jugadores.length});

            //Si estan los dos jugadores empezamos la partida dandole el turno al primero.
            if(jugadores.length == 2){
                turno = 1;
                io.sockets.emit('turno', {'turno' : 1, 'tablero' : tablero});
            }
        }

    });

    //Al recibir una jugada se comprueba que esa casilla del tablero está vacia y si se ha ganado o no.
    socket.on('marcarCelda', function(data){
        if(socket.jugador == turno && tablero[data] === ''){
            tablero[data] = figura(turno);
            jugadas++;

            //Comprobamos si ha ganado con esta jugada
            if(comprobarTablero(tablero)){
                io.sockets.emit('turno', {'turno' : turno, 'tablero' : tablero, 'ganador' : jugadores[turno-1]});
                desconectarAmbosJugadores();

            }else if(jugadas == 9){ //Empate
                io.sockets.emit('turno', {'turno' : turno, 'tablero' : tablero, 'empate' : true, 'jugadores' : jugadores});
                desconectarAmbosJugadores();

            }else{ //Una jugada normal
                turno = (turno == 1) ? 2 : 1;
                io.sockets.emit('turno', {'turno' : turno, 'tablero' : tablero});
            }

        }
    });

    //Si llega un mensaje del chat de un usuario lo limpiamos y reenviamos a todos los demás.
    socket.on('msg', function (data) {
        data.msg = sanitizer.escape(data.msg);
        io.sockets.emit('msg', data);
    });


    //Cuando un usuario se desconecta se comprueba que estaba en el chat, y se informa y actualiza la lista del resto de usuarios.
    socket.on('disconnect', function(){

        if( socket.nick ){
            usuarios.splice(usuarios.indexOf(socket.nick), 1);
            io.sockets.emit('desconectarUsuario', {nick : socket.nick, listaUsuarios : usuarios});
            console.log('usuario desconectado: ' + socket.nick);

            //Si era un jugador en activo sacan ambos de la partida
            if(socket.jugador){
                if(jugadores.length == 2){

                    desconectarAmbosJugadores();

                }else{ //Si estaba solo en la partida eliminamos su nombre de la partida

                    jugadores.splice(jugadores.indexOf(socket.nick), 1);
                    io.sockets.emit('desconectarJugador', {nick : socket.nick, jugador : socket.jugador});
                }
            }

        }

    });

});