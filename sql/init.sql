create table items 
(
  id bigint GENERATED ALWAYS AS IDENTITY,
  description text
);

insert into items
  (description)
values
  ('Pleurote'),
  ('Shiitake'),
  ('Champignon de Paris blanc'),
  ('Champignon de Paris brun'),
  ('Pholiote'),
  ('Lion`s Mane')