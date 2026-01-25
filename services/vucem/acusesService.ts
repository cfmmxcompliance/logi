
import { VucemConfig } from './types';
import { generateWSSEHeader, readPrivateKey, readCertificate, signCadenaOriginal, getCertificateBody } from './cryptoUtils';

const ACUSES_ENDPOINT = '/vucem-proxy/ventanilla-acuses-HA/ConsultaAcusesServiceWS';

export class AcusesService {
    /**
     * Descarga el Acuse Oficial (PDF) de una operación (COVE o Digitalización).
     * @param numeroOperacion El número de operación de VUCEM (ej. el eDocument o COVE).
     */
    async consultarAcuse(numeroOperacion: string, config: VucemConfig): Promise<string | null> {
        try {
            if (!config.keyFile || !config.cerFile) throw new Error("Faltan archivos FIEL");

            // 1. Credentials & Auth
            const privateKey = await readPrivateKey(config.keyFile, config.password);
            const { pem: certPem } = await readCertificate(config.cerFile);
            const certificateBody = getCertificateBody(certPem);

            // 2. Cadena Original: |RFC|NUMERO_OPERACION|
            // Nota: Para acuses, usualmente es el número de operación (EDoc/COVE).
            const cadenaOriginal = `|${config.rfc}|${numeroOperacion}|`;
            const firma = signCadenaOriginal(cadenaOriginal, privateKey);

            // 3. SOAP Request
            // Nota: El namespace 'acu' es hipotético basado en WSDL estándar de VUCEM.
            // Se ajustará si se obtiene error de namespace.
            const soapXml = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:acu="http://www.ventanillaunica.gob.mx/acuses/ws/oxml/">
   <soapenv:Header>
        ${generateWSSEHeader(config.rfc, config.webServicePassword || config.password)}
   </soapenv:Header>
   <soapenv:Body>
      <acu:ConsultarAcuseRequest>
         <acu:peticion>
            <acu:firmaElectronica>
               <acu:certificado>${certificateBody}</acu:certificado>
               <acu:cadenaOriginal>${cadenaOriginal}</acu:cadenaOriginal>
               <acu:firma>${firma}</acu:firma>
            </acu:firmaElectronica>
            <acu:numeroOperacion>${numeroOperacion}</acu:numeroOperacion>
         </acu:peticion>
      </acu:ConsultarAcuseRequest>
   </soapenv:Body>
</soapenv:Envelope>`;

            // 4. Send
            const response = await fetch(ACUSES_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': ''
                },
                body: soapXml
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const text = await response.text();

            // 5. Parse
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/xml");

            // Buscar el archivo en Base64. Tag usual: <archivo>, <pdf>, o <contenido>
            // En VUCEM Acuses suele ser <archivo> o <acuse>
            const archivoNode = doc.getElementsByTagName("archivo")[0] || doc.getElementsByTagName("acuse")[0];

            if (archivoNode) {
                return archivoNode.textContent; // Base64
            }

            return null;

        } catch (error) {
            console.error("Error consultando Acuse:", error);
            throw error;
        }
    }
}

export const acusesService = new AcusesService();
