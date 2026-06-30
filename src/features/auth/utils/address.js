const getAddressComponent = (addressComponents = [], types = []) => (
  addressComponents.find((component) => (
    types.every((type) => component.types?.includes(type))
  ))
);

const getLongName = (addressComponents, typeGroups) => {
  for (const types of typeGroups) {
    const component = getAddressComponent(addressComponents, types);
    if (component?.long_name) {
      return component.long_name;
    }
  }

  return '';
};

export const extractAddressFields = (details, fallbackDescription = '') => {
  const addressComponents = details?.address_components || [];
  const streetNumber = getLongName(addressComponents, [['street_number']]);
  const route = getLongName(addressComponents, [['route']]);
  const premise = getLongName(addressComponents, [['premise'], ['subpremise']]);
  const street = [streetNumber, route].filter(Boolean).join(' ').trim() || premise || fallbackDescription;
  const barangay = getLongName(addressComponents, [
    ['sublocality_level_1'],
    ['sublocality'],
    ['neighborhood'],
    ['administrative_area_level_4'],
  ]);
  const city = getLongName(addressComponents, [
    ['locality'],
    ['administrative_area_level_3'],
    ['postal_town'],
  ]);
  const province = getLongName(addressComponents, [
    ['administrative_area_level_2'],
    ['administrative_area_level_1'],
  ]);
  const region = getLongName(addressComponents, [
    ['administrative_area_level_1'],
  ]);
  const country = getLongName(addressComponents, [['country']]) || 'Philippines';
  const latitude = details?.geometry?.location?.lat;
  const longitude = details?.geometry?.location?.lng;

  return {
    street,
    barangay,
    city,
    province,
    region,
    country,
    latitude: latitude !== undefined && latitude !== null ? String(latitude) : '',
    longitude: longitude !== undefined && longitude !== null ? String(longitude) : '',
  };
};
