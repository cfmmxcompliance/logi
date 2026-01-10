<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

	<xsl:template match="/">
		<html>
			<xsl:apply-templates />
		</html>
	</xsl:template>
	
	<xsl:template match="Header" >
	</xsl:template>
	<xsl:template match="solicitarRecibirCoveServicio" >
		<xsl:apply-templates select="comprobantes" />
	</xsl:template>
	<xsl:template match="solicitarRecibirRelacionFacturasIAServicio" >
		<xsl:apply-templates select="comprobantes" />
	</xsl:template>
	<xsl:template match="solicitarRecibirRelacionFacturasNoIAServicio" >
		<xsl:apply-templates select="comprobantes" />
	</xsl:template>
	
	<xsl:template match="comprobantes" >
		<xsl:for-each select="current() "><br></br>
			Cadena Orignal :
			<xsl:if test="tipoOperacion  and  tipoOperacion != '' ">|<xsl:value-of select="tipoOperacion" /></xsl:if>
			<xsl:if test="numeroFacturaOriginal and numeroFacturaOriginal != '' ">|<xsl:value-of select="numeroFacturaOriginal" /></xsl:if>
			<xsl:if test="numeroRelacionFacturas and numeroRelacionFacturas != '' ">|<xsl:value-of select="numeroRelacionFacturas" />
			</xsl:if><xsl:choose><xsl:when test="parent::solicitarRecibirCoveServicio">|0</xsl:when><xsl:otherwise>|1</xsl:otherwise></xsl:choose>
			<xsl:if test="fechaExpedicion and fechaExpedicion!= '' ">|<xsl:value-of select="substring(fechaExpedicion, 1, 10)" /></xsl:if>
			<xsl:if test="tipoFigura and tipoFigura != '' ">|<xsl:value-of select="tipoFigura" /></xsl:if>
			<xsl:if test="observaciones and observaciones != '' ">|<xsl:value-of select="observaciones" /></xsl:if>
			<xsl:for-each select="rfcConsulta">|<xsl:value-of select="current()" /></xsl:for-each>
			<xsl:for-each select="patenteAduanal">|<xsl:value-of select="current()" /></xsl:for-each>
			<xsl:choose><xsl:when test="parent::solicitarRecibirCoveServicio">
					<xsl:apply-templates select="factura"/>
					<xsl:apply-templates select="emisor"/>
					<xsl:apply-templates select="destinatario"/>
					<xsl:apply-templates select="mercancias"/>
				</xsl:when>
				<xsl:when test="parent::solicitarRecibirRelacionFacturasIAServicio">
					<xsl:apply-templates select="emisor"/>
					<xsl:apply-templates select="destinatario"/>
					<xsl:for-each select="facturas">
						<xsl:apply-templates select="current() "/>
						<xsl:apply-templates select="mercancias"/>
					</xsl:for-each>
				</xsl:when>
				<xsl:when test="parent::solicitarRecibirRelacionFacturasNoIAServicio">					
					<xsl:for-each select="facturas">
						<xsl:apply-templates select="current() "/>
						<xsl:apply-templates select="emisor"/>
						<xsl:apply-templates select="destinatario"/>
						<xsl:apply-templates select="mercancias"/>
					</xsl:for-each>
				</xsl:when>
			</xsl:choose>|
			

			<br></br>
		</xsl:for-each>
	</xsl:template>
	
	<xsl:template match="factura">
			<xsl:if test="subdivision and subdivision != '' ">|<xsl:value-of select="subdivision" /></xsl:if>
			<xsl:if test="certificadoOrigen and certificadoOrigen != '' ">|<xsl:value-of select="certificadoOrigen" /></xsl:if>
			<xsl:if test="numeroExportadorAutorizado and numeroExportadorAutorizado != '' ">|<xsl:value-of select="numeroExportadorAutorizado" /></xsl:if>
	</xsl:template>

	<xsl:template match="facturas">
			<xsl:if test="numeroFactura and numeroFactura != '' ">|<xsl:value-of select="numeroFactura" /></xsl:if>
			<xsl:if test="subdivision and subdivision != '' ">|<xsl:value-of select="subdivision" /></xsl:if>
			<xsl:if test="certificadoOrigen and certificadoOrigen != '' ">|<xsl:value-of select="certificadoOrigen" /></xsl:if>
			<xsl:if test="numeroExportadorAutorizado and numeroExportadorAutorizado != '' ">|<xsl:value-of select="numeroExportadorAutorizado" /></xsl:if>
	</xsl:template>
	
	
	<xsl:template match="emisor">
		<xsl:if test="tipoIdentificador and tipoIdentificador != '' ">|<xsl:value-of select="tipoIdentificador" /></xsl:if>
		<xsl:if test="identificacion  and identificacion != '' ">|<xsl:value-of select="identificacion" /></xsl:if>
		<xsl:if test="apellidoPaterno and apellidoPaterno != '' ">|<xsl:value-of select="apellidoPaterno" /></xsl:if>
		<xsl:if test="apellidoMaterno and apellidoMaterno != '' ">|<xsl:value-of select="apellidoMaterno" /></xsl:if>
		<xsl:if test="nombre and nombre != '' ">|<xsl:value-of select="nombre" /></xsl:if>
		<xsl:apply-templates select="domicilio"/>
	</xsl:template>
	<xsl:template match="destinatario">
		<xsl:if test="tipoIdentificador and tipoIdentificador != '' ">|<xsl:value-of select="tipoIdentificador" /></xsl:if>
		<xsl:if test="identificacion and identificacion != '' ">|<xsl:value-of select="identificacion" /></xsl:if>
		<xsl:if test="apellidoPaterno and apellidoPaterno != '' ">|<xsl:value-of select="apellidoPaterno" /></xsl:if>
		<xsl:if test="apellidoMaterno and apellidoMaterno != '' ">|<xsl:value-of select="apellidoMaterno" /></xsl:if>
		<xsl:if test="nombre and nombre != '' ">|<xsl:value-of select="nombre" /></xsl:if>
		<xsl:apply-templates select="domicilio"/>
	</xsl:template>
	<xsl:template match="domicilio">
		<xsl:if test="calle and calle != '' ">|<xsl:value-of select="calle" /></xsl:if>
		<xsl:if test="numeroExterior and numeroExterior != '' ">|<xsl:value-of select="numeroExterior" /></xsl:if>
		<xsl:if test="numeroInterior and numeroInterior != '' ">|<xsl:value-of select="numeroInterior" /></xsl:if>
		<xsl:if test="colonia and colonia != '' ">|<xsl:value-of select="colonia" /></xsl:if>
		<xsl:if test="localidad and localidad != '' ">|<xsl:value-of select="localidad" /></xsl:if>
		<xsl:if test="municipio and municipio != '' ">|<xsl:value-of select="municipio" /></xsl:if>
		<xsl:if test="entidadFederativa and entidadFederativa != '' ">|<xsl:value-of select="entidadFederativa" /></xsl:if>
		<xsl:if test="pais and pais != '' ">|<xsl:value-of select="pais" /></xsl:if>
		<xsl:if test="codigoPostal and codigoPostal != '' ">|<xsl:value-of select="codigoPostal" /></xsl:if>
	</xsl:template>
	<xsl:template match="mercancias">
		<xsl:for-each select="current()">
			<xsl:if test="descripcionGenerica and descripcionGenerica != '' ">|<xsl:value-of select="descripcionGenerica" /></xsl:if>
			<xsl:if test="claveUnidadMedida and claveUnidadMedida != '' ">|<xsl:value-of select="claveUnidadMedida" /></xsl:if>
			<xsl:if test="cantidad and cantidad != '' ">|<xsl:value-of select="cantidad" /></xsl:if>
			<xsl:if test="tipoMoneda and tipoMoneda != '' ">|<xsl:value-of select="tipoMoneda" /></xsl:if>
			<xsl:if test="valorUnitario and valorUnitario != '' ">|<xsl:value-of select="valorUnitario" /></xsl:if>
			<xsl:if test="valorTotal and valorTotal != '' ">|<xsl:value-of select="valorTotal" /></xsl:if>
			<xsl:if test="valorDolares and valorDolares != '' ">|<xsl:value-of select="valorDolares" /></xsl:if>
			<xsl:apply-templates select="descripcionesEspecificas"/>
		</xsl:for-each>
	</xsl:template>
	<xsl:template match="descripcionesEspecificas">
		<xsl:for-each select="current()">
			<xsl:if test="marca and marca != '' ">|<xsl:value-of select="marca" /></xsl:if>
			<xsl:if test="modelo and modelo != '' ">|<xsl:value-of select="modelo" /></xsl:if>
			<xsl:if test="subModelo and subModelo != '' ">|<xsl:value-of select="subModelo" /></xsl:if>
			<xsl:if test="numeroSerie and numeroSerie != '' ">|<xsl:value-of select="numeroSerie" /></xsl:if>
		</xsl:for-each>
	</xsl:template>
</xsl:stylesheet>
