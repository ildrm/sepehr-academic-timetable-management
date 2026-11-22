CREATE TABLE component_room_requirement (
  component_id bigint REFERENCES component,
  feature text NOT NULL,
  PRIMARY KEY(component_id,feature)
);
