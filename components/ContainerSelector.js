import { useState, useEffect } from 'react';

export default function ContainerSelector({ containers = [], onSelectionChange }) {
  // selectedContainers : { [containerId]: { paramName: value, ... } }
  const [selectedContainers, setSelectedContainers] = useState({});
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');

  // Notifie le parent à chaque changement
  useEffect(() => {
    onSelectionChange && onSelectionChange(selectedContainers);
  }, [selectedContainers, onSelectionChange]);

  // Toggle sélection d'un container
  function toggleContainer(containerId) {
    setSelectedContainers(prev => {
      const isSelected = prev.hasOwnProperty(containerId);
      const newSelected = { ...prev };
      if (isSelected) {
        delete newSelected[containerId];
      } else {
        newSelected[containerId] = {};
      }
      setErrors({});
      setGlobalError('');
      return newSelected;
    });
  }

  // Change un paramètre d'un container sélectionné
  function handleParamChange(containerId, paramName, value) {
    setSelectedContainers(prev => ({
      ...prev,
      [containerId]: {
        ...prev[containerId],
        [paramName]: value,
      },
    }));
    setErrors(prev => {
      if (prev[containerId]?.[paramName]) {
        const newErrors = { ...prev };
        delete newErrors[containerId][paramName];
        if (Object.keys(newErrors[containerId]).length === 0) {
          delete newErrors[containerId];
        }
        return newErrors;
      }
      return prev;
    });
    setGlobalError('');
  }

  // Validation simple : vérifier les champs required
  function validate() {
    const newErrors = {};
    Object.entries(selectedContainers).forEach(([containerId, params]) => {
      const container = containers.find(c => c.id === containerId);
      if (!container) return;

      container.parameters.forEach(param => {
        // skip hidden params
        if (param.hidden) return;

        // gérer visibleIf
        if (param.visibleIf && !param.visibleIf(params['VPN_SERVICE_PROVIDER'])) {
          return;
        }

        if (param.required && (!params[param.name] || params[param.name].toString().trim() === '')) {
          if (!newErrors[containerId]) newErrors[containerId] = {};
          newErrors[containerId][param.name] = `Le champ "${param.description || param.name}" est requis`;
        }
      });
    });

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      setGlobalError('Veuillez remplir tous les champs requis');
      return false;
    }
    setGlobalError('');
    return true;
  }

  // Tu peux appeler validate() avant génération ou soumission

  return (
    <div>
      <h2>Containers disponibles</h2>
      {containers.map(container => {
        const isSelected = selectedContainers.hasOwnProperty(container.id);
        const params = selectedContainers[container.id] || {};
        const containerErrors = errors[container.id] || {};

        return (
          <div key={container.id} style={{ marginBottom: 15, border: '1px solid #ddd', padding: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleContainer(container.id)}
              />
              <strong style={{ marginLeft: 8 }}>{container.name}</strong> - {container.description}
            </label>

            {isSelected && container.parameters.length > 0 && (
              <div style={{ marginTop: 10, paddingLeft: 20 }}>
                {container.parameters.map(param => {
                  if (param.hidden) return null;
                  if (param.visibleIf && !param.visibleIf(params['VPN_SERVICE_PROVIDER'])) return null;

                  if (param.type === 'select') {
                    return (
                      <div key={param.name} style={{ marginBottom: 8 }}>
                        <label>
                          {param.description || param.name} :
                          <select
                            value={params[param.name] || ''}
                            onChange={e => handleParamChange(container.id, param.name, e.target.value)}
                            required={param.required}
                            style={{
                              marginLeft: 8,
                              borderColor: containerErrors[param.name] ? 'red' : undefined,
                            }}
                          >
                            <option value="" disabled>
                              -- Sélectionner --
                            </option>
                            {param.options.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {containerErrors[param.name] && (
                          <p style={{ color: 'red', margin: 0 }}>{containerErrors[param.name]}</p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={param.name} style={{ marginBottom: 8 }}>
                      <label>
                        {param.description || param.name} :
                        <input
                          type={param.type === 'password' ? 'password' : 'text'}
                          value={params[param.name] || ''}
                          onChange={e => handleParamChange(container.id, param.name, e.target.value)}
                          required={param.required}
                          style={{
                            marginLeft: 8,
                            borderColor: containerErrors[param.name] ? 'red' : undefined,
                          }}
                        />
                      </label>
                      {containerErrors[param.name] && (
                        <p style={{ color: 'red', margin: 0 }}>{containerErrors[param.name]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {globalError && (
        <p style={{ color: 'red', fontWeight: 'bold', marginTop: 10 }}>{globalError}</p>
      )}
    </div>
  );
}
