
import { VucemConfig, ConsultarEdocumentResponse, Cove } from './types';
import { signCadenaOriginal, getCertificateBody, generateWSSEHeader, readPrivateKey, readCertificate } from './cryptoUtils';

const VUCEM_PROXY_ENDPOINT = '/vucem-proxy/ventanilla/ConsultarEdocument';
const NAMESPACE_CONSULTA = 'http://www.ventanillaunica.gob.mx/ConsultarEdocument/';
const NAMESPACE_COMMON = 'http://www.ventanillaunica.gob.mx/cove/ws/oxml/';

export class VucemService {
    private formatDate(dateStr: string): string {
        if (!dateStr) return "";
        const cleanDate = dateStr.replace(/\//g, '-');
        const parts = cleanDate.split('-');
        if (parts[0].length === 2 && parts[2]?.length === 4) {
            return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
        if (parts[0].length === 4) {
            const [y, m, d] = parts;
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
        return dateStr;
    }

    async consultarEdocument(query: string | { start: string, end: string }, config: VucemConfig): Promise<ConsultarEdocumentResponse> {
        if (!config.keyFile || !config.cerFile) throw new Error("Faltan archivos FIEL");
        const privateKey = await readPrivateKey(config.keyFile, config.password);
        const { pem: certPem } = await readCertificate(config.cerFile);
        const certificateBody = getCertificateBody(certPem);

        let cadenaOriginal = "";
        let criterioXml = "";

        if (typeof query === 'string') {
            cadenaOriginal = `|${config.rfc}|${query}|`;
            criterioXml = `<con:eDocument>${query}</con:eDocument>`;
        } else {
            const vStart = this.formatDate(query.start);
            const vEnd = this.formatDate(query.end);
            cadenaOriginal = `|${config.rfc}|${vStart}|${vEnd}|`;
            criterioXml = `
            <con:fechaInicio>${vStart}</con:fechaInicio>
            <con:fechaFin>${vEnd}</con:fechaFin>`;
        }

        const firma = signCadenaOriginal(cadenaOriginal, privateKey);

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
            <con:criterioBusqueda>${criterioXml}</con:criterioBusqueda>
         </con:request>
      </con:ConsultarEdocumentRequest>
   </soapenv:Body>
</soapenv:Envelope>`;

        return this.fetchWithRetry(soapXml);
    }

    private async fetchWithRetry(xmlBody: string, retries = 2): Promise<ConsultarEdocumentResponse> {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 45000);

            const response = await fetch(VUCEM_PROXY_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': 'http://www.ventanillaunica.gob.mx/cove/ws/service/ConsultarEdocument'
                },
                body: xmlBody,
                signal: controller.signal
            });
            clearTimeout(id);

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

            const responseText = await response.text();
            return this.parseResponse(responseText);

        } catch (error: any) {
            const msg = (error.message || "").toLowerCase();

            if (msg.includes('auth') ||
                msg.includes('password') ||
                msg.includes('contraseña') ||
                msg.includes('credentials') ||
                msg.includes('firma') ||
                msg.includes('signature')) {
                throw error;
            }

            if (retries > 0 && (error.name === 'AbortError' || msg.includes('network') || msg.includes('fetch'))) {
                console.warn(`Reintentando conexión por fallo de red... quedan ${retries}`);
                await new Promise(res => setTimeout(res, 1000));
                return this.fetchWithRetry(xmlBody, retries - 1);
            }
            throw error;
        }
    }

    private parseResponse(xml: string): ConsultarEdocumentResponse {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        const fault = doc.querySelector("Fault");
        if (fault) {
            const code = fault.querySelector("faultcode")?.textContent;
            const str = fault.querySelector("faultstring")?.textContent;
            throw new Error(`VUCEM SOAP Fault [${code}]: ${str}`);
        }

        const contieneError = doc.getElementsByTagName("contieneError")[0]?.textContent === 'true';
        const errors: string[] = [];
        if (contieneError) {
            const errorNodes = doc.getElementsByTagName("mensaje");
            for (let i = 0; i < errorNodes.length; i++) errors.push(errorNodes[i].textContent || "Error");
        }
        const allCoveNodes = doc.getElementsByTagName("cove");
        const coves: Cove[] = [];
        for (let i = 0; i < allCoveNodes.length; i++) {
            coves.push(this.parseCoveNode(allCoveNodes[i]));
        }
        const adendaNode = doc.getElementsByTagName("adenda")[0];
        const adenda = adendaNode ? new XMLSerializer().serializeToString(adendaNode) : undefined;
        return { contieneError, errores: errors, resultadoBusqueda: { cove: coves[0], coves, adenda } };
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
            facturas.push({ numeroFactura: this.getNodeText(node, "numeroFactura") || "", mercancias: this.parseMercancias(node) });
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
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) { if (all[i].localName === tagName) return all[i].textContent; }
        return null;
    }
}

export const vucemService = new VucemService();
