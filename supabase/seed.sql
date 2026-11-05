-- KUN TIL LOKAL TEST. Bruges ikke på den rigtige side.
insert into public.arrangementer (titel, dato, tid, sted, beskrivelse) values
('Ulkeaften med skydning', current_date + 7, '19:00', 'Det Maritime Hus', ''),
('Julefrokost', current_date + 16, '18:00', 'Det Maritime Hus', 'Tilmelding i Marinestuen'),
('Nytårsparole', current_date + 62, '11:00', 'Det Maritime Hus', ''),
('Admiralsforsamling', current_date + 100, '10:00', 'Det Maritime Hus', 'Dagsorden ifølge vedtægterne');
insert into public.vagter (titel, dato, tid, sted, pladser) values
('Bar ved julefrokost', current_date + 16, '17:30', 'Det Maritime Hus', 2),
('Kaffe i Marinestuen', current_date + 2, '10:00', 'Marinestuen', 1),
('Opstilling af borde', current_date + 15, '14:00', 'Det Maritime Hus', 3),
('Oprydning efter nytårsparole', current_date + 62, '14:00', 'Det Maritime Hus', 2);
