// LATAM geo data — países, provincias/estados/departamentos y ciudades
// principales. Se usa en el onboarding wizard (selector cascade país →
// provincia → ciudad) y para sugerir prefijo telefónico.
//
// Cobertura: EC (Ecuador), AR (Argentina), CO (Colombia), MX (México),
// PE (Perú), CL (Chile). Para cada provincia listamos la capital + ciudades
// principales. No es catastro completo; si el usuario no encuentra su
// ciudad puede usar la opción "Otra" que sale como provincia.
//
// Persistencia (formato acordado): `profiles.country` = nombre del país,
// `profiles.city` = "Provincia / Ciudad".

export type Province = {
  name: string;
  cities: string[];
};

export type Country = {
  code: string;
  name: string;
  phoneCode: string;
  provinces: Province[];
};

const EC: Country = {
  code: "EC",
  name: "Ecuador",
  phoneCode: "+593",
  provinces: [
    { name: "Azuay", cities: ["Cuenca", "Gualaceo", "Paute", "Sigsig"] },
    { name: "Bolívar", cities: ["Guaranda", "San Miguel", "Chillanes"] },
    { name: "Cañar", cities: ["Azogues", "La Troncal", "Cañar", "Biblián"] },
    { name: "Carchi", cities: ["Tulcán", "San Gabriel", "El Ángel"] },
    { name: "Chimborazo", cities: ["Riobamba", "Guano", "Chambo", "Alausí"] },
    { name: "Cotopaxi", cities: ["Latacunga", "Salcedo", "La Maná", "Pujilí"] },
    { name: "El Oro", cities: ["Machala", "Pasaje", "Santa Rosa", "Huaquillas", "Zaruma"] },
    { name: "Esmeraldas", cities: ["Esmeraldas", "Atacames", "Quinindé", "Muisne"] },
    { name: "Galápagos", cities: ["Puerto Ayora", "Puerto Baquerizo Moreno", "Puerto Villamil"] },
    { name: "Guayas", cities: ["Guayaquil", "Durán", "Samborondón", "Daule", "Milagro", "Playas", "Naranjal", "Nobol"] },
    { name: "Imbabura", cities: ["Ibarra", "Otavalo", "Cotacachi", "Atuntaqui"] },
    { name: "Loja", cities: ["Loja", "Catamayo", "Cariamanga", "Macará"] },
    { name: "Los Ríos", cities: ["Babahoyo", "Quevedo", "Ventanas", "Vinces"] },
    { name: "Manabí", cities: ["Portoviejo", "Manta", "Chone", "Bahía de Caráquez", "Jipijapa", "Pedernales"] },
    { name: "Morona Santiago", cities: ["Macas", "Sucúa", "Gualaquiza"] },
    { name: "Napo", cities: ["Tena", "Archidona", "El Chaco"] },
    { name: "Orellana", cities: ["Francisco de Orellana", "La Joya de los Sachas", "Loreto"] },
    { name: "Pastaza", cities: ["Puyo", "Mera", "Santa Clara"] },
    { name: "Pichincha", cities: ["Quito", "Cumbayá", "Tumbaco", "Calderón", "La Carolina", "Sangolquí", "Machachi", "Cayambe", "Tabacundo"] },
    { name: "Santa Elena", cities: ["Santa Elena", "La Libertad", "Salinas"] },
    { name: "Santo Domingo de los Tsáchilas", cities: ["Santo Domingo", "La Concordia"] },
    { name: "Sucumbíos", cities: ["Nueva Loja", "Shushufindi", "La Bonita"] },
    { name: "Tungurahua", cities: ["Ambato", "Baños", "Pelileo", "Píllaro"] },
    { name: "Zamora Chinchipe", cities: ["Zamora", "Yantzaza", "Zumba"] },
  ],
};

const AR: Country = {
  code: "AR",
  name: "Argentina",
  phoneCode: "+54",
  provinces: [
    { name: "Buenos Aires", cities: ["La Plata", "Mar del Plata", "Bahía Blanca", "Tandil", "Quilmes", "San Isidro"] },
    { name: "CABA (Ciudad Autónoma)", cities: ["Buenos Aires"] },
    { name: "Catamarca", cities: ["San Fernando del Valle de Catamarca", "Andalgalá"] },
    { name: "Chaco", cities: ["Resistencia", "Sáenz Peña"] },
    { name: "Chubut", cities: ["Rawson", "Comodoro Rivadavia", "Puerto Madryn", "Trelew"] },
    { name: "Córdoba", cities: ["Córdoba", "Río Cuarto", "Villa Carlos Paz", "Villa María"] },
    { name: "Corrientes", cities: ["Corrientes", "Goya", "Mercedes"] },
    { name: "Entre Ríos", cities: ["Paraná", "Concordia", "Gualeguaychú"] },
    { name: "Formosa", cities: ["Formosa", "Clorinda"] },
    { name: "Jujuy", cities: ["San Salvador de Jujuy", "Palpalá", "Libertador General San Martín"] },
    { name: "La Pampa", cities: ["Santa Rosa", "General Pico"] },
    { name: "La Rioja", cities: ["La Rioja", "Chilecito"] },
    { name: "Mendoza", cities: ["Mendoza", "San Rafael", "Godoy Cruz", "Maipú"] },
    { name: "Misiones", cities: ["Posadas", "Oberá", "Puerto Iguazú"] },
    { name: "Neuquén", cities: ["Neuquén", "San Martín de los Andes", "Cutral Có"] },
    { name: "Río Negro", cities: ["Viedma", "San Carlos de Bariloche", "General Roca"] },
    { name: "Salta", cities: ["Salta", "Tartagal", "Orán"] },
    { name: "San Juan", cities: ["San Juan", "Caucete", "Rivadavia"] },
    { name: "San Luis", cities: ["San Luis", "Villa Mercedes"] },
    { name: "Santa Cruz", cities: ["Río Gallegos", "Caleta Olivia", "El Calafate"] },
    { name: "Santa Fe", cities: ["Santa Fe", "Rosario", "Rafaela", "Venado Tuerto"] },
    { name: "Santiago del Estero", cities: ["Santiago del Estero", "La Banda"] },
    { name: "Tierra del Fuego", cities: ["Ushuaia", "Río Grande"] },
    { name: "Tucumán", cities: ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo"] },
  ],
};

const CO: Country = {
  code: "CO",
  name: "Colombia",
  phoneCode: "+57",
  provinces: [
    { name: "Amazonas", cities: ["Leticia", "Puerto Nariño"] },
    { name: "Antioquia", cities: ["Medellín", "Bello", "Envigado", "Itagüí", "Rionegro"] },
    { name: "Arauca", cities: ["Arauca", "Saravena"] },
    { name: "Atlántico", cities: ["Barranquilla", "Soledad", "Malambo"] },
    { name: "Bolívar", cities: ["Cartagena", "Magangué", "Turbaco"] },
    { name: "Boyacá", cities: ["Tunja", "Duitama", "Sogamoso"] },
    { name: "Caldas", cities: ["Manizales", "Villamaría", "La Dorada"] },
    { name: "Caquetá", cities: ["Florencia", "San Vicente del Caguán"] },
    { name: "Casanare", cities: ["Yopal", "Aguazul"] },
    { name: "Cauca", cities: ["Popayán", "Santander de Quilichao"] },
    { name: "Cesar", cities: ["Valledupar", "Aguachica"] },
    { name: "Chocó", cities: ["Quibdó", "Istmina"] },
    { name: "Córdoba", cities: ["Montería", "Lorica", "Cereté"] },
    { name: "Cundinamarca", cities: ["Soacha", "Facatativá", "Zipaquirá", "Chía"] },
    { name: "Distrito Capital", cities: ["Bogotá"] },
    { name: "Guainía", cities: ["Inírida"] },
    { name: "Guaviare", cities: ["San José del Guaviare"] },
    { name: "Huila", cities: ["Neiva", "Pitalito", "Garzón"] },
    { name: "La Guajira", cities: ["Riohacha", "Maicao", "Uribia"] },
    { name: "Magdalena", cities: ["Santa Marta", "Ciénaga"] },
    { name: "Meta", cities: ["Villavicencio", "Acacías"] },
    { name: "Nariño", cities: ["Pasto", "Tumaco", "Ipiales"] },
    { name: "Norte de Santander", cities: ["Cúcuta", "Ocaña", "Pamplona"] },
    { name: "Putumayo", cities: ["Mocoa", "Puerto Asís"] },
    { name: "Quindío", cities: ["Armenia", "Calarcá", "La Tebaida"] },
    { name: "Risaralda", cities: ["Pereira", "Dosquebradas", "Santa Rosa de Cabal"] },
    { name: "San Andrés y Providencia", cities: ["San Andrés", "Providencia"] },
    { name: "Santander", cities: ["Bucaramanga", "Floridablanca", "Girón", "Barrancabermeja"] },
    { name: "Sucre", cities: ["Sincelejo", "Corozal"] },
    { name: "Tolima", cities: ["Ibagué", "Espinal", "Melgar"] },
    { name: "Valle del Cauca", cities: ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago"] },
    { name: "Vaupés", cities: ["Mitú"] },
    { name: "Vichada", cities: ["Puerto Carreño"] },
  ],
};

const MX: Country = {
  code: "MX",
  name: "México",
  phoneCode: "+52",
  provinces: [
    { name: "Aguascalientes", cities: ["Aguascalientes", "Jesús María"] },
    { name: "Baja California", cities: ["Tijuana", "Mexicali", "Ensenada"] },
    { name: "Baja California Sur", cities: ["La Paz", "Los Cabos", "Loreto"] },
    { name: "Campeche", cities: ["Campeche", "Ciudad del Carmen"] },
    { name: "Chiapas", cities: ["Tuxtla Gutiérrez", "San Cristóbal de las Casas", "Tapachula"] },
    { name: "Chihuahua", cities: ["Chihuahua", "Ciudad Juárez", "Delicias"] },
    { name: "Ciudad de México", cities: ["Ciudad de México"] },
    { name: "Coahuila", cities: ["Saltillo", "Torreón", "Monclova"] },
    { name: "Colima", cities: ["Colima", "Manzanillo", "Tecomán"] },
    { name: "Durango", cities: ["Durango", "Gómez Palacio"] },
    { name: "Estado de México", cities: ["Toluca", "Ecatepec", "Naucalpan", "Tlalnepantla"] },
    { name: "Guanajuato", cities: ["León", "Guanajuato", "Irapuato", "Celaya"] },
    { name: "Guerrero", cities: ["Chilpancingo", "Acapulco", "Iguala"] },
    { name: "Hidalgo", cities: ["Pachuca", "Tulancingo"] },
    { name: "Jalisco", cities: ["Guadalajara", "Zapopan", "Tlaquepaque", "Puerto Vallarta"] },
    { name: "Michoacán", cities: ["Morelia", "Uruapan", "Zamora"] },
    { name: "Morelos", cities: ["Cuernavaca", "Cuautla"] },
    { name: "Nayarit", cities: ["Tepic", "Bahía de Banderas"] },
    { name: "Nuevo León", cities: ["Monterrey", "San Pedro Garza García", "Apodaca"] },
    { name: "Oaxaca", cities: ["Oaxaca de Juárez", "Salina Cruz", "Tuxtepec"] },
    { name: "Puebla", cities: ["Puebla", "Tehuacán", "Cholula"] },
    { name: "Querétaro", cities: ["Querétaro", "San Juan del Río"] },
    { name: "Quintana Roo", cities: ["Cancún", "Playa del Carmen", "Cozumel", "Tulum", "Chetumal"] },
    { name: "San Luis Potosí", cities: ["San Luis Potosí", "Soledad de Graciano Sánchez"] },
    { name: "Sinaloa", cities: ["Culiacán", "Mazatlán", "Los Mochis"] },
    { name: "Sonora", cities: ["Hermosillo", "Ciudad Obregón", "Nogales"] },
    { name: "Tabasco", cities: ["Villahermosa", "Cárdenas"] },
    { name: "Tamaulipas", cities: ["Ciudad Victoria", "Reynosa", "Matamoros", "Nuevo Laredo"] },
    { name: "Tlaxcala", cities: ["Tlaxcala", "Apizaco"] },
    { name: "Veracruz", cities: ["Xalapa", "Veracruz", "Coatzacoalcos", "Poza Rica"] },
    { name: "Yucatán", cities: ["Mérida", "Valladolid", "Progreso"] },
    { name: "Zacatecas", cities: ["Zacatecas", "Fresnillo"] },
  ],
};

const PE: Country = {
  code: "PE",
  name: "Perú",
  phoneCode: "+51",
  provinces: [
    { name: "Amazonas", cities: ["Chachapoyas", "Bagua"] },
    { name: "Áncash", cities: ["Huaraz", "Chimbote", "Casma"] },
    { name: "Apurímac", cities: ["Abancay", "Andahuaylas"] },
    { name: "Arequipa", cities: ["Arequipa", "Camaná", "Mollendo"] },
    { name: "Ayacucho", cities: ["Ayacucho", "Huanta"] },
    { name: "Cajamarca", cities: ["Cajamarca", "Jaén"] },
    { name: "Callao", cities: ["Callao"] },
    { name: "Cusco", cities: ["Cusco", "Sicuani", "Quillabamba"] },
    { name: "Huancavelica", cities: ["Huancavelica"] },
    { name: "Huánuco", cities: ["Huánuco", "Tingo María"] },
    { name: "Ica", cities: ["Ica", "Chincha Alta", "Pisco"] },
    { name: "Junín", cities: ["Huancayo", "Jauja", "La Oroya"] },
    { name: "La Libertad", cities: ["Trujillo", "Chepén", "Pacasmayo"] },
    { name: "Lambayeque", cities: ["Chiclayo", "Lambayeque", "Ferreñafe"] },
    { name: "Lima", cities: ["Lima", "Miraflores", "San Isidro", "Barranco", "Huacho"] },
    { name: "Loreto", cities: ["Iquitos", "Yurimaguas"] },
    { name: "Madre de Dios", cities: ["Puerto Maldonado"] },
    { name: "Moquegua", cities: ["Moquegua", "Ilo"] },
    { name: "Pasco", cities: ["Cerro de Pasco"] },
    { name: "Piura", cities: ["Piura", "Sullana", "Talara", "Paita"] },
    { name: "Puno", cities: ["Puno", "Juliaca"] },
    { name: "San Martín", cities: ["Moyobamba", "Tarapoto"] },
    { name: "Tacna", cities: ["Tacna"] },
    { name: "Tumbes", cities: ["Tumbes", "Zarumilla"] },
    { name: "Ucayali", cities: ["Pucallpa"] },
  ],
};

const CL: Country = {
  code: "CL",
  name: "Chile",
  phoneCode: "+56",
  provinces: [
    { name: "Arica y Parinacota", cities: ["Arica", "Putre"] },
    { name: "Tarapacá", cities: ["Iquique", "Alto Hospicio"] },
    { name: "Antofagasta", cities: ["Antofagasta", "Calama", "Tocopilla"] },
    { name: "Atacama", cities: ["Copiapó", "Vallenar", "Caldera"] },
    { name: "Coquimbo", cities: ["La Serena", "Coquimbo", "Ovalle"] },
    { name: "Valparaíso", cities: ["Valparaíso", "Viña del Mar", "Quilpué", "San Antonio"] },
    { name: "Metropolitana de Santiago", cities: ["Santiago", "Puente Alto", "Maipú", "Las Condes", "Providencia"] },
    { name: "O'Higgins", cities: ["Rancagua", "San Fernando", "Pichilemu"] },
    { name: "Maule", cities: ["Talca", "Curicó", "Linares"] },
    { name: "Ñuble", cities: ["Chillán", "San Carlos"] },
    { name: "Biobío", cities: ["Concepción", "Talcahuano", "Los Ángeles", "Coronel"] },
    { name: "La Araucanía", cities: ["Temuco", "Villarrica", "Pucón"] },
    { name: "Los Ríos", cities: ["Valdivia", "La Unión"] },
    { name: "Los Lagos", cities: ["Puerto Montt", "Osorno", "Castro"] },
    { name: "Aysén", cities: ["Coyhaique", "Puerto Aysén"] },
    { name: "Magallanes", cities: ["Punta Arenas", "Puerto Natales"] },
  ],
};

export const LATAM_COUNTRIES: Country[] = [EC, AR, CO, MX, PE, CL];

export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return LATAM_COUNTRIES.find((c) => c.code === code) ?? null;
}

export function findProvince(countryCode: string, provinceName: string): Province | null {
  const c = findCountry(countryCode);
  if (!c) return null;
  return c.provinces.find((p) => p.name === provinceName) ?? null;
}
