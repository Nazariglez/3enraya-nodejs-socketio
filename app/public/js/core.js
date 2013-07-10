jQuery(document).ready(function(){

	var socket = io.connect();

	var nick = false, usuarios = [], //Almacenamos todos los nombres de usuarios
		turno = false; //Determina si es el turno del jugador.

	//Al conectarse el usuario se cargan los jugadores que están jugando y el tablero.
	socket.on('conexion', function(data){
		if(data.jugadores.length !== 0){

			var len = data.jugadores.length;
			for(var i = 0; i < len; i++){
				var datos = { nick : data.jugadores[i], jugador : i+1};

				actualizarJugadores(datos);
			}

			actualizarTablero(data.tablero);

		}

		//Medimos la latencia cliente -> servidor -> cliente y la mostramos en el cliente.
		var ping = setInterval(function(){
			socket.emit('ping', (new Date).getTime(), function(data){
				var latencia = ((new Date).getTime() - data)/1000;
				$('#latencia span').html(latencia);
			});
		},1000);
	});

	socket.on('disconnect', function(data){
		alert('Ha ocurrido un error en la conexión con el servidor.');
		location.reload();
	});

	//Para evitar fallos en algunos navegador eliminamos el atributo disabled del login y le asignamos foco
	$('#login input[type=text]').removeAttr('disabled').focus();


	//Enviamos el nombre del usuario al pulsar 'enter'
	$('#login input[type=text]').on('keypress', function(e){

		if( e.keyCode == 13 && ($(this).attr('disabled') != 'disabled')){
			e.preventDefault();

			var nombre = $.trim($(this).val());

			if( nombre !== '' ){
				$(this).attr({ 'disabled' : 'disabled' });
				socket.emit('comprobarUsuario',nombre, function(data){

					//Si no es valido el nombre se muestra un mensaje de error
					if(!data.ok){
						$('#login p.error').html(data.msg);
						$('#login input[type=text]').removeAttr('disabled');
					}else{

						//Si es correcto ocultamos el panel de login y asignamos el foco en el chat
						nick = data.nick;
						$('#login-contenedor').slideUp('slow');
						$('#chat textarea').focus();

					}

				});
			}

		}

	});

	//Enviamos a todos los clientes la lista de usuarios actualizada y el anuncio de el nuevo usuario
	socket.on('nuevoUsuario', function(data){
		mensajeSistema( 'conexion' , data.nick );
		usuarios = data.listaUsuarios;

		actualizarUsuarios(usuarios);

	});

	//Al desconectarse un usuario avisamos al resto mediante el chat y actualizamos la lista
	socket.on('desconectarUsuario', function(data){
		mensajeSistema( 'desconexion' , data.nick );
		usuarios = data.listaUsuarios;

		actualizarUsuarios(usuarios);
	});


	//Identificamos cada celda del tablero
	$('.columna').each(function(e){

		$(this).attr({ 'data-celda' : parseInt(e, 10) });
		console.log($(this).attr('data-celda'));

	});

	//Al clicar una casilla
	$('.columna').on('click', function(){

		if(socket.jugador && turno && $(this).html() === ''){

			var celda = $(this).attr('data-celda');

			socket.emit('marcarCelda', celda);

		}

	});

	//Enviar al servidor el texto introducido en el chat
	$('#chat textarea').on('keypress', function(e){

		if(!nick){
			e.preventDefault(); //Si no tiene nick no se puede escribir
		}else if(e.keyCode == 13){
			e.preventDefault();

			var msg = $.trim($(this).val());

			if( msg !== '') {
				$(this).val('');

				socket.emit('msg',{ nombre : nick, 'msg' : msg});

			}
		}
	});

	//Se envia al servidor la petición para ser un jugador
	$('#unirse').on('click', function(){
		if( !$(this).hasClass('completo') && !socket.jugador ){
			socket.emit('nuevoJugador', nick, function(data){
				if( data.ok ){
					socket.jugador = data.jugador;
				}
			});
		}
	});

	//Se actualiza la información en pantalla con los jugadores
	var actualizarJugadores = function(data){
		mensajeSistema( 'jugador' , data);
		$('#jugadores .estado[data-jugador="' + data.jugador + '"] .figura').addClass('bg-verde');
		$('#jugadores .estado[data-jugador="' + data.jugador + '"] .nombre').html(data.nick);

		if(data.jugador == 2){
			$('#unirse').addClass('completo');
			$('#unirse').html('Completo');
		}
	};

	socket.on('nuevoJugador', function(data){
		actualizarJugadores(data);
	});

	//Decretamos el turno correspondiente
	socket.on('turno', function(data){
		if(data.turno == socket.jugador){
			turno = true;
		}else{
			turno = false;
		}

		$('#jugadores .estado .nombre').removeClass('turno-verde');
		$('#jugadores .estado[data-jugador="' + data.turno + '"] .nombre').addClass('turno-verde');

		actualizarTablero(data.tablero);

		//Comprobamos si el servidor indica el ganador
		if(data.ganador){
			mensajeSistema( 'ganador' , data.ganador );
		}else if(data.empate){
			mensajeSistema( 'empate' , data.jugadores );
		}
	});


	//Se conecta un jugador dejando el slot libre para otro
	socket.on('desconectarJugador', function(data){

		$('#jugadores .estado[data-jugador="' + data.jugador + '"] .figura').removeClass('bg-verde');
		$('#jugadores .estado[data-jugador="' + data.jugador + '"] .nombre').html('Esperando jugador...');
		$('#unirse').removeClass('completo');
		$('#unirse').html('Unirse');

	});

	//Al terminar la partida o si hay dos jugadore y sale uno se echan ambos de la partida.
	socket.on('desconectarAmbosJugadores', function(data){

		$('#jugadores .estado .figura').removeClass('bg-verde');
		$('#jugadores .estado .nombre').removeClass('turno-verde');
		$('#jugadores .estado .nombre').html('Esperando jugador...');
		$('#unirse').removeClass('completo');
		$('#unirse').html('Unirse');

		if(socket.jugador){
			delete socket.jugador;
		}

	});

	//Al enviar un mensaje via chat se actualizan el chat al resto.
	socket.on('msg', function(data){
		mensajeSistema( 'chat' , data );
	});

	//Actualizamos el tablero con los datos del servidor.
	var actualizarTablero = function( tablero ){

		var i, len = tablero.length;
		for(i = 0; i < len; i++){
			$('#tablero .columna[data-celda="' + i + '"]').html(tablero[i]);
		}

	};

	//Actualizar lista de usuarios
	var actualizarUsuarios = function(usuarios){
		var len = usuarios.length,
			texto = '';

		for(var i = 0; i < len; i++){

			texto += '<span class="usuario">' + usuarios[i] + '</span>';

		}

		$('#chat #usuarios').html(texto);
	};


	var mensajeSistema = function( tipo , datos ){

		switch(tipo){

			case 'ganador':
				$('#chat .texto').append('<span class="frase azul"> *' + datos + '* ha ganado esta partida.</span>');
			break;
			case 'empate':
				$('#chat .texto').append('<span class="frase azul"> *' + datos[0] + '* y *' + datos[1] + '*han quedado en tablas.</span>');
			break;
			case 'chat':
				$('#chat .texto').append('<span class="frase"><strong>' + datos.nombre + ':</strong> ' + datos.msg + '</span>');
			break;
			case 'conexion':
				$('#chat .texto').append('<span class="frase verde">  *' + datos + '* se ha unido al chat.</span>');
			break;
			case 'desconexion':
				$('#chat .texto').append('<span class="frase rojo">  *' + datos+ '* ha abandonado el chat.</span>');
			break;
			case 'jugador':
				$('#chat .texto').append('<span class="frase naranja"> *' + datos.nick + '* es el Jugador ' + datos.jugador + '.</span>');
			break;

		}

		$('#chat .texto').scrollTop(99999);

	};

});