
import { VucemConfig, ConsultarEdocumentResponse, Cove } from './types';
import { signCadenaOriginal, getCertificateBody, generateWSSEHeader, readPrivateKey, readCertificate } from './cryptoUtils';

const VUCEM_PROXY_ENDPOINT = '/vucem-proxy/ventanilla/ConsultarEdocument';
const NAMESPACE_CONSULTA = 'http://www.ventanillaunica.gob.mx/ConsultarEdocument/';
const NAMESPACE_COMMON = 'http://www.ventanillaunica.gob.mx/cove/ws/oxml/';

export class VucemService {
    async consultarEdocument(edocument: string, config: VucemConfig): Promise<ConsultarEdocumentResponse> {
        try {
            if (!config.keyFile || !config.cerFile) {
                throw new Error("Faltan archivos de la FIEL (.key o .cer)");
            }

            // 1. Prepare Credentials
            const privateKey = await readPrivateKey(config.keyFile, config.password);
            const { pem: certPem } = await readCertificate(config.cerFile);
            const certificateBody = getCertificateBody(certPem);

            // 2. Build Cadena Original (Inferred Format: |RFC|EDOCUMENT|)
            // NOTE: This format is crucial. If VUCEM rejects signature, this is the first place to debug.
            // Often it is |RFC|eDocument| or just |eDocument|.
            // Let's try |RFC|eDocument| as it's standard to include the caller's RFC.
            const cadenaOriginal = `|${config.rfc}|${edocument}|`;

            // 3. Sign
            const firma = signCadenaOriginal(cadenaOriginal, privateKey);

            // 4. Build SOAP XML
            const soapXml = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="${NAMESPACE_CONSULTA}" xmlns:com="${NAMESPACE_COMMON}">
   <soapenv:Header>
        ${generateWSSEHeader(config.rfc, config.password)}
   </soapenv:Header>
   <soapenv:Body>
      <con:ConsultarEdocumentRequest>
         <con:request>
            <con:firmaElectronica>
               <com:certificado>${certificateBody}</com:certificado>
               <com:cadenaOriginal>${cadenaOriginal}</com:cadenaOriginal>
               <com:firma>${firma}</com:firma>
            </con:firmaElectronica>
            <con:criterioBusqueda>
               <con:eDocument>${edocument}</con:eDocument>
            </con:criterioBusqueda>
         </con:request>
      </con:ConsultarEdocumentRequest>
   </soapenv:Body>
</soapenv:Envelope>`;

            // 5. Send Request
            console.log("Sending SOAP Request to VUCEM Proxy:", VUCEM_PROXY_ENDPOINT);
            console.log(soapXml);

            const response = await fetch(VUCEM_PROXY_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': 'http://www.ventanillaunica.gob.mx/cove/ws/service/ConsultarEdocument'
                },
                body: soapXml
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`VUCEM Error (${response.status}): ${text}`);
            }

            const responseText = await response.text();
            console.log("VUCEM Response:", responseText);

            return this.parseResponse(responseText);

        } catch (error: any) {
            console.error("VUCEM Service Error:", error);
            throw new Error(error.message || "Error desconocido al consultar VUCEM");
        }
    }

    private parseResponse(xml: string): ConsultarEdocumentResponse {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");

        // Check for Fault
        const fault = doc.querySelector("Fault");
        if (fault) {
            const faultString = doc.querySelector("faultstring")?.textContent;
            throw new Error(`SOAP Fault: ${faultString}`);
        }

        const containsError = doc.getElementsByTagName("contieneError")[0]?.textContent === 'true';
        const errors: string[] = [];
        if (containsError) {
            const errorNodes = doc.getElementsByTagName("mensaje");
            for (let i = 0; i < errorNodes.length; i++) {
                errors.push(errorNodes[i].textContent || "Error desconocido");
            }
        }

        // Parse Result if exists
        const coveNode = doc.getElementsByTagName("cove")[0];
        let cove: Cove | undefined;

        if (coveNode) {
            cove = {
                eDocument: this.getNodeText(coveNode, "eDocument") || "",
                tipoOperacion: this.getNodeText(coveNode, "tipoOperacion") || "",
                numeroFacturaRelacionFacturas: this.getNodeText(coveNode, "numeroFacturaRelacionFacturas") || "",
                fechaExpedicion: this.getNodeText(coveNode, "fechaExpedicion") || "",
                tipoFigura: this.getNodeText(coveNode, "tipoFigura") || "",
                facturas: [], // Parse facturas details if needed
                emisor: this.parsePersona(coveNode.getElementsByTagName("emisor")[0]),
                destinatario: this.parsePersona(coveNode.getElementsByTagName("destinatario")[0]),
                // Add more fields parsing as needed
            };
        }

        return {
            contieneError: containsError,
            errores: errors,
            resultadoBusqueda: { cove }
        };
    }

    private parsePersona(node: Element | null): any {
        if (!node) return {};
        return {
            identificacion: this.getNodeText(node, "identificacion"),
            nombre: this.getNodeText(node, "nombre"),
            apellidoPaterno: this.getNodeText(node, "apellidoPaterno"),
        };
    }

    private getNodeText(parent: Element, tagName: string): string | null {
        const node = parent.getElementsByTagName(tagName)[0]; // naive search, assume unique direct child or use namespaces properly
        // In SOAP response, tags might have namespaces.
        // It's safer to search by localName if possible, or use getElementsByTagNameNS if namespace known.
        // For simplicity:
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === tagName) return all[i].textContent;
        }
        return null;
    }
}

export const vucemService = new VucemService();
