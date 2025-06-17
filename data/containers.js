import Dashboard from '../pages/setup/dashboard';
import timezones from './timezones.json';

export const containers = {
  medialibrary: [
    {
      id: 'radarr',
      name: 'Radarr',
      description: 'Gestionnaire de films pour téléchargements automatiques',
      container_name: 'radarr',
      image: 'linuxserver/radarr:latest',
      ports: ['7878:7878'],
      volumes: [
        './radarr/movies:/movies',
        './radarr/config:/config'
      ],
      environment: [],
      restart: 'unless-stopped',
      parameters: []
    },
    {
      id: 'prowlarr',
      name: 'Prowlarr',
      description: 'Gestionnaire d\'indexer relié à Radarr, Sonarr, Lidarr, Readarr',
      container_name: 'prowlarr',
      image: 'linuxserver/prowlarr:latest',
      ports: ['9696:9696'],
      volumes: [
        './prowlarr/config:/config'
      ],
      environment: [],
      restart: 'unless-stopped',
      parameters: []
    },
    {
      id: 'gluetun',
      name: 'Gluetun',
      description: 'Client VPN avec plusieurs fournisseurs',
      container_name: 'gluetun',
      image: 'qmcgaw/gluetun:latest',
      volumes: ['/path/to/gluetun/config:/gluetun'],
      environment: [
        'VPN_SERVICE_PROVIDER',
        'VPN_TYPE',
        'OPENVPN_USER',
        'OPENVPN_PASSWORD',
        'OPENVPN_CUSTOM_CONFIG',
        'TZ',
      ],
      restart: 'unless-stopped',
      parameters: [
        {
          name: 'VPN_SERVICE_PROVIDER',
          type: 'select',
          required: true,
          description: 'Fournisseur VPN',
          options: [
            { label: 'ProtonVPN', value: 'protonvpn' },
            { label: 'OpenVPN (personnalisé)', value: 'openvpn' },
          ],
        },
        // Ces paramètres sont conditionnels et affichés selon VPN_SERVICE_PROVIDER sélectionné
        {
          name: 'OPENVPN_USER',
          type: 'string',
          required: true,
          description: 'Identifiant OpenVPN',
          visibleIf: provider => provider === 'protonvpn',
        },
        {
          name: 'OPENVPN_PASSWORD',
          type: 'password',
          required: true,
          description: 'Mot de passe OpenVPN',
          visibleIf: provider => provider === 'protonvpn',
        },
        {
          name: 'OPENVPN_CUSTOM_CONFIG',
          type: 'string',
          required: true,
          description: 'Chemin du fichier de configuration OpenVPN',
          visibleIf: provider => provider === 'openvpn',
        },
        {
          name: 'VPN_TYPE',
          type: 'string',
          required: true,
          description: 'Type VPN (fixé à openvpn si OpenVPN sélectionné)',
          defaultValue: '',
          hidden: true, // on ne l'affiche pas dans le formulaire, on le préremplit
        },
        {
          name: 'TZ',
          type: 'select',
          description: 'Fuseau horaire',
          options: timezones,
        },
      ],
    },
  ],
  dashboard: [
    {
      id: 'homarr',
      name: 'Homarr',
      description: 'Dashboard avec gestion multi-utilisateur, groupe, et plusieurs intégration',
      container_name: 'homarr',
      image: 'ghcr.io/homarr-labs/homarr:latest',
      ports: ['7575:7575'],
      volumes: [
        '/var/run/docker.sock:/var/run/docker.sock',
        './homarr/appdata:/appdata'
      ],
      environment: [],
      restart: 'unless-stopped',
      parameters: []
    },
  ],
};