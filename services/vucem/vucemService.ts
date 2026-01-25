
import { VucemConfig, ConsultarEdocumentResponse, Cove } from './types';
import { signCadenaOriginal, getCertificateBody, generateWSSEHeader, readPrivateKey, readCertificate } from './cryptoUtils';

const VUCEM_PROXY_ENDPOINT = '/vucem-proxy/ventanilla/ConsultarEdocument';
const NAMESPACE_CONSULTA = 'http://www.ventanillaunica.gob.mx/ConsultarEdocument/';
const NAMESPACE_COMMON = 'http://www.ventanillaunica.gob.mx/cove/ws/oxml/';

export class VucemService {
    async consultarEdocument(query: string | { start: string, end: string }, config: VucemConfig): Promise<ConsultarEdocumentResponse> {
        try {
            if (!config.keyFile || !config.cerFile) {
                throw new Error("Faltan archivos de la FIEL (.key o .cer)");
            }

            // 1. Prepare Credentials
            const privateKey = await readPrivateKey(config.keyFile, config.password);
            const { pem: certPem } = await readCertificate(config.cerFile);
            const certificateBody = getCertificateBody(certPem);

            let cadenaOriginal = "";
            let criterioXml = "";

            if (typeof query === 'string') {
                // Single Edocument Search
                cadenaOriginal = `|${config.rfc}|${query}|`;
                criterioXml = `<con:eDocument>${query}</con:eDocument>`;
            } else {
                // Date Range Search
                // Format for Cadena Original with Dates: |RFC|FECHA_INI|FECHA_FIN|
                cadenaOriginal = `|${config.rfc}|${query.start}|${query.end}|`;
                criterioXml = `
                <con:fechaInicio>${query.start}</con:fechaInicio>
                <con:fechaFin>${query.end}</con:fechaFin>`;
            }

            // 3. Sign
            const firma = signCadenaOriginal(cadenaOriginal, privateKey);

            // 4. Build SOAP XML
            const soapXml = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="${NAMESPACE_CONSULTA}" xmlns:com="${NAMESPACE_COMMON}">
   <soapenv:Header>
        ${generateWSSEHeader(config.rfc, config.webServicePassword || config.password)}
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
               ${criterioXml}
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

        const coveNode = doc.getElementsByTagName("cove")[0];
        let cove: Cove | undefined;
        let coves: Cove[] = [];

        // Single result parsing
        if (coveNode) {
            cove = this.parseCoveNode(coveNode);
        }

        // Multiple results parsing (for Date Range)
        const allCoveNodes = doc.getElementsByTagName("cove");
        if (allCoveNodes.length > 0) {
            for (let i = 0; i < allCoveNodes.length; i++) {
                coves.push(this.parseCoveNode(allCoveNodes[i]));
            }
        }

        // Check for Adenda
        const adendaNode = doc.getElementsByTagName("adenda")[0];
        let adendaXml: string | undefined;
        if (adendaNode) {
            // Serialize ONLY the content inside <adenda>
            adendaXml = new XMLSerializer().serializeToString(adendaNode);
        }

        return {
            contieneError: containsError,
            errores: errors,
            resultadoBusqueda: { cove, coves, adenda: adendaXml }
        };
    }

    private parseCoveNode(coveNode: Element): Cove {
        return {
            eDocument: this.getNodeText(coveNode, "eDocument") || "",
            tipoOperacion: this.getNodeText(coveNode, "tipoOperacion") || "",
            numeroFacturaRelacionFacturas: this.getNodeText(coveNode, "numeroFacturaRelacionFacturas") || "",
            fechaExpedicion: this.getNodeText(coveNode, "fechaExpedicion") || "",
            tipoFigura: this.getNodeText(coveNode, "tipoFigura") || "",
            emisor: this.parsePersona(coveNode.getElementsByTagName("emisor")[0]),
            destinatario: this.parsePersona(coveNode.getElementsByTagName("destinatario")[0]),
            facturas: this.parseFacturas(coveNode),
            observaciones: this.getNodeText(coveNode, "observaciones") || undefined
        };
    }

    private parseFacturas(coveNode: Element): any[] {
        const facturasNodes = coveNode.getElementsByTagName("facturas");
        const facturas: any[] = [];
        for (let i = 0; i < facturasNodes.length; i++) {
            const node = facturasNodes[i];
            facturas.push({
                numeroFactura: this.getNodeText(node, "numeroFactura") || "",
                mercancias: this.parseMercancias(node)
            });
        }
        return facturas;
    }

    private parseMercancias(node: Element): any[] {
        const mercsNodes = node.getElementsByTagName("mercancias");
        const mercs: any[] = [];
        for (let i = 0; i < mercsNodes.length; i++) {
            const mNode = mercsNodes[i];
            mercs.push({
                descripcionGenerica: this.getNodeText(mNode, "descripcionGenerica") || "",
                claveUnidadMedida: this.getNodeText(mNode, "claveUnidadMedida") || "",
                tipoMoneda: this.getNodeText(mNode, "tipoMoneda") || "",
                cantidad: Number(this.getNodeText(mNode, "cantidad") || 0),
                valorUnitario: Number(this.getNodeText(mNode, "valorUnitario") || 0),
                valorTotal: Number(this.getNodeText(mNode, "valorTotal") || 0),
                valorDolares: Number(this.getNodeText(mNode, "valorDolares") || 0),
                descripcionesEspecificas: this.parseDetalles(mNode)
            });
        }
        return mercs;
    }

    private parseDetalles(mNode: Element): any[] {
        const detNodes = mNode.getElementsByTagName("descripcionesEspecificas");
        const detalles: any[] = [];
        for (let i = 0; i < detNodes.length; i++) {
            const dNode = detNodes[i];
            detalles.push({
                marca: this.getNodeText(dNode, "marca") || undefined,
                modelo: this.getNodeText(dNode, "modelo") || undefined,
                subModelo: this.getNodeText(dNode, "subModelo") || undefined,
                numeroSerie: this.getNodeText(dNode, "numeroSerie") || undefined
            });
        }
        return detalles;
    }

    private parsePersona(node: Element | null): any {
        if (!node) return { identificacion: '', domicilio: {} };
        return {
            tipoIdentificador: Number(this.getNodeText(node, "tipoIdentificador") || 0),
            identificacion: this.getNodeText(node, "identificacion") || "",
            nombre: this.getNodeText(node, "nombre") || undefined,
            domicilio: this.parseDomicilio(node.getElementsByTagName("domicilio")[0])
        };
    }

    private parseDomicilio(node: Element | null): any {
        if (!node) return {};
        return {
            calle: this.getNodeText(node, "calle") || "",
            numeroExterior: this.getNodeText(node, "numeroExterior") || "",
            numeroInterior: this.getNodeText(node, "numeroInterior") || undefined,
            colonia: this.getNodeText(node, "colonia") || undefined,
            localidad: this.getNodeText(node, "localidad") || undefined,
            municipio: this.getNodeText(node, "municipio") || undefined,
            entidadFederativa: this.getNodeText(node, "entidadFederativa") || undefined,
            pais: this.getNodeText(node, "pais") || "",
            codigoPostal: this.getNodeText(node, "codigoPostal") || ""
        };
    }

    private getNodeText(parent: Element, tagName: string): string | null {
        // Search by localName to ignore namespaces
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === tagName) return all[i].textContent;
        }
        return null;
    }
}

export const vucemService = new VucemService();
