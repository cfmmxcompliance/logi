
import { VucemConfig } from './types';
import { generateWSSEHeader, readPrivateKey, readCertificate, signCadenaOriginal, getCertificateBody } from './cryptoUtils';

const PEDIMENTO_ENDPOINT = '/vucem-proxy/ventanilla-ws-pedimentos/ConsultarPedimentoCompletoService';

export class PedimentoService {
    /**
     * Consulta el XML completo de un pedimento.
     * @param pedimento Número de pedimento a 15 dígitos (Patente + Año + Folio) o 7 dígitos si se tiene contexto.
     * usualmente requiere: Patente, Aduana, Pedimento.
     * En este caso simplificado asumo que pasamos la llave compuesta o el objeto.
     */
    async consultarPedimentoCompleto(patente: string, aduana: string, pedimento: string, config: VucemConfig): Promise<string | null> {
        try {
            if (!config.keyFile || !config.cerFile) throw new Error("Faltan archivos FIEL");

            const privateKey = await readPrivateKey(config.keyFile, config.password);
            const { pem: certPem } = await readCertificate(config.cerFile);
            const certificateBody = getCertificateBody(certPem);

            // Cadena Original para Pedimentos suele ser: |RFC|PATENTE|ADUANA|PEDIMENTO|
            const cadenaOriginal = `|${config.rfc}|${patente}|${aduana}|${pedimento}|`;
            const firma = signCadenaOriginal(cadenaOriginal, privateKey);

            const soapXml = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ped="http://www.ventanillaunica.gob.mx/pedimentos/ws/oxml/">
   <soapenv:Header>
        ${generateWSSEHeader(config.rfc, config.webServicePassword || config.password)}
   </soapenv:Header>
   <soapenv:Body>
      <ped:ConsultarPedimentoCompletoRequest>
         <ped:peticion>
            <ped:firmaElectronica>
               <ped:certificado>${certificateBody}</ped:certificado>
               <ped:cadenaOriginal>${cadenaOriginal}</ped:cadenaOriginal>
               <ped:firma>${firma}</ped:firma>
            </ped:firmaElectronica>
            <ped:numeroPedimento>${pedimento}</ped:numeroPedimento>
            <ped:patente>${patente}</ped:patente>
            <ped:aduana>${aduana}</ped:aduana>
         </ped:peticion>
      </ped:ConsultarPedimentoCompletoRequest>
   </soapenv:Body>
</soapenv:Envelope>`;

            const response = await fetch(PEDIMENTO_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': ''
                },
                body: soapXml
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const text = await response.text();

            // Extract XML content
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/xml");

            // Usually returns a <pedimento> tag or <archivo> base64
            // For "Pedimento Completo", it often returns the XML structure directly embedded OR base64.
            // Let's assume Base64 for consistency with other download services, but check for direct XML.
            const archivoNode = doc.getElementsByTagName("archivo")[0] || doc.getElementsByTagName("contenido")[0];

            if (archivoNode) {
                return archivoNode.textContent; // Base64
            }

            return null;

        } catch (error) {
            console.error("Error consultando Pedimento:", error);
            throw error;
        }
    }
}

export const pedimentoService = new PedimentoService();
