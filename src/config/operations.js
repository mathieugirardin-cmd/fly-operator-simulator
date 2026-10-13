// Gameplay conventions, not measured operating procedures of the attraction.
export const FLEET_SIZE=6;
export const LOCKER_CONFIG=Object.freeze({count:120,reservationDuration:.4,depositDuration:3,retrievalDuration:2.5,depositCapacity:6,preparationCapacity:40});
export const lockerId=index=>`C${String(index+1).padStart(3,'0')}`;
