FANTASY BASQUET ALELLA - V13

Primera versió funcional amb comptes d'usuari i panell d'administració de prova.

CANVIS V13
- Pressupost inicial: 120 M€.
- Cada usuari autenticat té el seu propi equip Fantasy.
- Alta i inici de sessió amb Supabase Auth (correu + contrasenya; nom d'usuari per al perfil).
- Panell d'administració amagat: fes 5 clics ràpids sobre el logo i introdueix el PIN de prova 1234.
- Administració: resultats de jornada, nova jornada i reset de dades de prova.
- Els entrenadors ja no mostren cap dorsal/ID a les seves cartes.

IMPORTANT: el PIN 1234 és només una protecció visual de prova. No és seguretat real de producció.

1. Executa SETUP_V13.sql al SQL Editor de Supabase una sola vegada.
2. Si Supabase té activada la confirmació obligatòria del correu, cal confirmar el correu abans d'iniciar sessió.
3. Obre OBRIR_FANTASY.command.

L'app utilitza el projecte Supabase configurat a config.js.


V15 - PANELL D'ENTRENADOR

1. Executa SETUP_V15.sql a Supabase.
2. Els entrenadors necessiten un compte normal de Supabase.
3. Després, un administrador ha de vincular el compte amb el coach corresponent a public.coach_users.
   Exemple (substitueix l'UUID i el coach_id):

   insert into public.coach_users(user_id, coach_id) values ('UUID_DEL_COMPTE', 1);

4. El compte vinculat veurà la pestanya Panell d'entrenador.
5. L'administrador desa primer els resultats. Els entrenadors seleccionen el jugador destacat.
6. Quan tots els destacats estiguin seleccionats, l'administrador prem Processar jornada.

V15 inclou: mercat de jugadors i entrenadors, classificació, capità i panell d'entrenador.

V15.1 - REGISTRE I INICI DE SESSIÓ
- Pantalla d'inici de sessió i creació de compte preparada per a jugadors i entrenadors.
- El registre demana repetir la contrasenya.
- Els entrenadors es registren amb el seu propi correu; l'administrador els vincula després al seu perfil d'entrenador.
- No cal vincular el compte personal de l'administrador amb cap entrenador.


V16 — Retrocedir jornades i mercat dinàmic
- El valor dels jugadors varia automàticament segons victòries/derrotes i jugador destacat.
- El valor dels entrenadors és independent per entrenador + equip real.
- Administració: botó «Retrocedir última jornada» per desfer punts, valors, destacats i resultats de l’última jornada processada.
- Les plantilles i transferències no es modifiquen durant el rollback.
- Executa SETUP_V16.sql a Supabase abans de publicar aquesta versió.
